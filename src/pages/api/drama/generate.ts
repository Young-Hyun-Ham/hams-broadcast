import type { APIRoute } from 'astro';
import { collectAndSaveDramaData } from '../../../services/dramaCollector';
import { adminUnauthorizedResponse, isAdminRequest } from '../../../lib/adminAuth';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!isAdminRequest(request)) return adminUnauthorizedResponse();
  try {
    // 1. Request Body에서 국가 코드 파라미터 추출 (기본값: 'KR')
    let countryCode = 'KR';
    
    // Body 데이터가 있는 경우 JSON 파싱
    const contentType = request.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const body = await request.json();
      if (body.countryCode) {
        countryCode = body.countryCode;
      }
    }

    console.log(`[Manual Trigger] 수동 수집 요청 시작 - 국가: ${countryCode}`);

    // 3. 기존 수집 및 Firestore 저장 로직 실행
    const result = await collectAndSaveDramaData(countryCode, {
      saveHistory: true,
      trigger: 'manual',
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `[${countryCode}] 주간 드라마 데이터 수동 생성 완료`,
        data: result,
        timestamp: new Date().toISOString()
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Manual API Error]:', error);

    return new Response(
      JSON.stringify({
        success: false,
        message: '드라마 데이터 수동 수집 중 오류가 발생했습니다.',
        error: error instanceof Error ? error.message : String(error)
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
