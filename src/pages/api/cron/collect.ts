import type { APIRoute } from 'astro';
import { collectAndSaveDramaData } from '../../../services/dramaCollector';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  try {
    // 1. Bearer Token 보안 검증
    const authHeader = request.headers.get('Authorization');
    const cronSecret = import.meta.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return new Response(
        JSON.stringify({ success: false, message: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Query Parameter 수신 (기본 국가코드: KR)
    const url = new URL(request.url);
    const countryCode = url.searchParams.get('country') || 'KR';

    // 3. 수집 서비스 실행 및 Firestore 저장
    const result = await collectAndSaveDramaData(countryCode);

    return new Response(
      JSON.stringify({
        success: true,
        message: `[${countryCode}] Firestore 저장 완료`,
        data: result,
        timestamp: new Date().toISOString()
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Internal server error during collection',
        error: error instanceof Error ? error.message : String(error)
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};