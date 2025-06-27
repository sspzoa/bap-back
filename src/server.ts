import { serve } from 'bun';
import { CONFIG } from './config';
import { setupRefreshJob } from './jobs/refreshCafeteria';
import { handleCors } from './middleware/cors';
import { ApiError, handleError } from './middleware/error';
import { handleCafeteriaRequest, handleClearCache, handleHealthCheck } from './routes';

export function createServer() {
  setupRefreshJob();

  return serve({
    port: CONFIG.SERVER.PORT,

    async fetch(req: Request) {
      const url = new URL(req.url);
      const path = url.pathname;

      try {
        const corsResponse = handleCors(req);
        if (corsResponse) return corsResponse;

        if (path === '/health') {
          return await handleHealthCheck();
        }

        if (path === '/clear-cache' && req.method === 'POST') {
          return await handleClearCache();
        }

        const datePattern = /^\/(\d{4}-\d{2}-\d{2})$/;
        const dateMatch = path.match(datePattern);

        if (dateMatch) {
          const dateParam = dateMatch[1];
          return await handleCafeteriaRequest(dateParam);
        }

        if (path === '/') {
          return new Response('api.밥.net');
        }

        throw new ApiError(404, 'Endpoint not found');
      } catch (error) {
        return handleError(error);
      }
    },
  });
}
