import { serve } from 'bun';
import { CONFIG } from './config';
import { setupRefreshJob } from './jobs/refreshCafeteria';
import { handleCors } from './middleware/cors';
import { ApiError, handleError } from './middleware/error';
import { handleCafeteriaRequest, handleClearCache, handleHealthCheck } from './routes';
import { mongoDB } from './utils/mongodb';
import { logger } from './utils/logger';

export async function createServer() {
  await mongoDB.connect();

  setupRefreshJob();

  const server = serve({
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

  process.on('SIGINT', async () => {
    logger.info('Shutting down server...');
    await mongoDB.disconnect();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Shutting down server...');
    await mongoDB.disconnect();
    process.exit(0);
  });

  return server;
}