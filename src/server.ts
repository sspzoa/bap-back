import { serve } from 'bun';
import { handleCafeteriaRequest } from './routes/cafeteriaRoute';
import { CONFIG } from './config';
import { setupCronJob } from './utils/cron';
import { memoryCache } from './utils/cache-utils';

export const server = serve({
  port: CONFIG.PORT,
  async fetch(req: Request) {
    const url = new URL(req.url);
    const path = url.pathname;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    if (path === '/clear-cache' && req.method === 'POST') {
      memoryCache.clear();
      return new Response(JSON.stringify({ success: true, message: 'Cache cleared' }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

    if (path === '/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        cacheStatus: {
          menu_posts: memoryCache.has('cafeteria_menu_posts')
        }
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      });
    }

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

    if (path === '/') {
      return new Response('api.밥.net', {
        headers: corsHeaders
      });
    }

    return new Response('Not Found', {
      status: 404,
      headers: corsHeaders
    });
  },
});

setupCronJob(30 * 60 * 1000);