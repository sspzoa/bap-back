import { serve } from 'bun'; // Bun 환경
import { handleCafeteriaRequest } from './routes/cafeteriaRoute';
import { CONFIG } from './config';

/**
 * Bun 서버 설정
 * - "/YYYY-MM-DD" 형태의 라우트만 처리
 * - 기타 라우트는 404로 응답
 */
export const server = serve({
  port: CONFIG.PORT,
  async fetch(req: Request) {
    const url = new URL(req.url);
    const path = url.pathname;

    // CORS 헤더 설정
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };

    // OPTIONS 요청 처리 (CORS preflight)
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    // 날짜 형식 패턴 (예: /2025-02-24)
    const datePattern = /^\/(\d{4}-\d{2}-\d{2})$/;
    const dateMatch = path.match(datePattern);

    if (dateMatch) {
      const dateParam = dateMatch[1];
      const { status, body } = await handleCafeteriaRequest(dateParam);
      return new Response(JSON.stringify(body), {
        status,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    // 루트 경로 (간단 안내 메시지)
    if (path === '/') {
      return new Response('api.밥.net', {
        headers: corsHeaders
      });
    }

    // 404 Not Found
    return new Response('Not Found', {
      status: 404,
      headers: corsHeaders
    });
  },
});

