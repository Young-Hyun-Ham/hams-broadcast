import { GoogleGenAI } from '@google/genai';
import { Timestamp, type DocumentReference } from 'firebase-admin/firestore';
import { db } from '../lib/firebaseAdmin';
import { generateDramaPrompt } from '../utils/promptGenerator';

const ai = new GoogleGenAI({ apiKey: import.meta.env.GEMINI_API_KEY });

// 주차 문자열 생성 (예: 2026-09-3주차)
export function getWeekFormattedString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');

  const firstDayOfMonth = new Date(year, date.getMonth(), 1);
  const firstDayOfWeek = firstDayOfMonth.getDay() || 7;
  const offsetDate = date.getDate() + firstDayOfWeek - 1;
  const weekNumber = Math.ceil(offsetDate / 7);

  return `${year}-${month}-${weekNumber}주차`;
}

type CollectionOptions = {
  saveHistory?: boolean;
  trigger?: 'manual' | 'cron';
};

function parseJsonResponse(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
  const arrayStart = cleaned.indexOf('[');
  const arrayEnd = cleaned.lastIndexOf(']');
  const json = arrayStart >= 0 && arrayEnd > arrayStart
    ? cleaned.slice(arrayStart, arrayEnd + 1)
    : cleaned;
  return JSON.parse(json);
}

export async function collectAndSaveDramaData(
  countryCode: string = 'KR',
  options: CollectionOptions = {},
) {
  const normalizedCountryCode = countryCode.toUpperCase();
  const startedAt = new Date();
  const weekString = getWeekFormattedString(startedAt);
  const prompt = generateDramaPrompt({ countryCode: normalizedCountryCode });
  let historyRef: DocumentReference | undefined;

  try {
    if (options.saveHistory) {
      historyRef = db.collection('broadcastGenerationHistory').doc();
      await historyRef.set({
        countryCode: normalizedCountryCode,
        createdWeek: weekString,
        trigger: options.trigger || 'manual',
        status: 'processing',
        prompt,
        requestedAt: Timestamp.fromDate(startedAt),
      });
    }

    // 1. AI 데이터 생성 요청
    let jsonText = '';
    let finishReasons: string[] = [];
    for (let attempt = 1; attempt <= 2 && !jsonText; attempt += 1) {
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          maxOutputTokens: 32768,
        },
      });
      jsonText = response.text?.trim() || '';
      finishReasons = response.candidates
        ?.map((candidate) => String(candidate.finishReason || 'UNKNOWN')) || [];
      if (!jsonText) {
        console.warn(`[Gemini] 빈 응답 (${attempt}/2), 종료 사유: ${finishReasons.join(', ') || 'UNKNOWN'}`);
      }
    }

    if (!jsonText) {
      throw new Error(`AI 응답 데이터가 비어있습니다. 종료 사유: ${finishReasons.join(', ') || 'UNKNOWN'}`);
    }

    const parsedData = parseJsonResponse(jsonText);
    const now = new Date();

    // 2. Firestore Document 참조 설정 (컬렉션: broadcast)
    // 문서 ID를 'KR_2026-09-3주차' 형식으로 지정하여 중복 방지 및 주차별 식별 용이화
    const docId = `${normalizedCountryCode}_${weekString}`;
    const broadcastDocRef = db.collection('broadcast').doc(docId);

    // 3. 상위 broadcast 문서 저장/업데이트
    await broadcastDocRef.set({
      countryCode: normalizedCountryCode,
      createdAt: Timestamp.fromDate(now),
      createdWeek: weekString
    }, { merge: true });

    // 4. 평탄 배열과 방송사별 dramas 중첩 배열을 모두 저장 형식으로 정규화합니다.
    const records: Array<Record<string, unknown>> = [];
    if (Array.isArray(parsedData)) {
      for (const item of parsedData) {
        if (Array.isArray(item?.dramas)) {
          for (const drama of item.dramas) {
            records.push({
              broadcaster: item.broadcaster,
              ...drama,
              updatedAt: Timestamp.fromDate(now),
            });
          }
        } else if (item && typeof item === 'object' && item.title) {
          records.push({
            ...item,
            updatedAt: Timestamp.fromDate(now),
          });
        }
      }
    }

    if (!records.length) {
      throw new Error('AI 응답에서 저장 가능한 드라마 항목을 찾지 못했습니다.');
    }

    // 같은 주차를 다시 생성할 때 기존 목록을 제거해 중복을 방지합니다.
    const dramaSubCollectionRef = broadcastDocRef.collection('drama');
    const existing = await dramaSubCollectionRef.get();
    for (let index = 0; index < existing.docs.length; index += 400) {
      const deleteBatch = db.batch();
      existing.docs.slice(index, index + 400).forEach((document) => deleteBatch.delete(document.ref));
      await deleteBatch.commit();
    }

    for (let index = 0; index < records.length; index += 400) {
      const writeBatch = db.batch();
      records.slice(index, index + 400).forEach((record) => {
        writeBatch.set(dramaSubCollectionRef.doc(), record);
      });
      await writeBatch.commit();
    }
    console.log(`[Success] Firestore 데이터 저장 완료 (Doc ID: ${docId})`);

    if (historyRef) {
      await historyRef.update({
        status: 'success',
        broadcastDocId: docId,
        responseText: jsonText,
        responseData: parsedData,
        itemCount: records.length,
        completedAt: Timestamp.fromDate(new Date()),
      });
    }
    
    return {
      docId,
      weekString,
      itemCount: records.length,
      historyId: historyRef?.id,
    };

  } catch (error) {
    console.error('[Error] 드라마 데이터 수집 및 Firestore 저장 중 오류:', error);
    if (historyRef) {
      try {
        await historyRef.update({
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          completedAt: Timestamp.fromDate(new Date()),
        });
      } catch (historyError) {
        console.error('[Error] 수동 생성 실패 이력 저장 중 오류:', historyError);
      }
    }
    throw error;
  }
}
