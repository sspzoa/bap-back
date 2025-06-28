import { serve } from 'bun';
import { CONFIG } from './config';
import { setupRefreshJob } from './jobs/refreshCafeteria';
import { handleCors } from './middleware/cors';
import { ApiError, handleError } from './middleware/error';
import { handleCafeteriaRequest, handleHealthCheck } from './routes';
import { mongoDB } from './utils/mongodb';
import { logger } from './utils/logger';

export async function createServer() {
  logger.info('Starting server initialization...');

  await mongoDB.connect();

  const refreshJob = setupRefreshJob();
  logger.info('Refresh job scheduled');

  const server = serve({
    port: CONFIG.SERVER.PORT,

    async fetch(req: Request) {
      const url = new URL(req.url);
      const path = url.pathname;
      const method = req.method;

      logger.info(`${method} ${path}`);

      try {
        const corsResponse = handleCors(req);
        if (corsResponse) return corsResponse;

        if (path === '/health') {
          return await handleHealthCheck();
        }

        const dateMatch = path.match(/^\/(\d{4}-\d{2}-\d{2})$/);
        if (dateMatch) {
          logger.info(`Fetching cafeteria data for date: ${dateMatch[1]}`);
          return await handleCafeteriaRequest(dateMatch[1]);
        }

        if (path === '/') {
          return new Response('api.밥.net');
        }

        logger.warn(`Unknown endpoint accessed: ${path}`);
        throw new ApiError(404, 'Endpoint not found');
      } catch (error) {
        return handleError(error);
      }
    },
  });

  const shutdown = async () => {
    logger.info('Shutdown signal received');
    if (refreshJob) clearTimeout(refreshJob);
    await mongoDB.disconnect();
    logger.info('Server shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  logger.info('Server initialization complete');
  return server;
}