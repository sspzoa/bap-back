import { serve } from 'bun';
import { CONFIG } from './config';
import { setupRefreshJob } from './jobs/refreshCafeteria';
import { getCorsHeaders, handleCors } from './middleware/cors';
import { ApiError, handleError } from './middleware/error';
import { handleCafeteriaRequest, handleHealthCheck, handleRefreshRequest } from './routes';
import { logger } from './utils/logger';
import { mongoDB } from './utils/mongodb';

function generateRequestId(): string {
  return Math.random().toString(36).substring(2, 10);
}

export async function createServer() {
  logger.info('Starting server initialization');

  try {
    await mongoDB.connect();
    const refreshJob = setupRefreshJob();

    logger.info(`Server running at http://${CONFIG.SERVER.HOST}:${CONFIG.SERVER.PORT}`);

    const server = serve({
      port: CONFIG.SERVER.PORT,

      async fetch(req: Request) {
        const url = new URL(req.url);
        const path = url.pathname;
        const method = req.method;

        const requestLogger = logger.request(method, path);
        const requestId = requestLogger.context?.requestId || generateRequestId();
        const startTime = Date.now();

        try {
          const corsResponse = handleCors(req);
          if (corsResponse) {
            requestLogger.response(204, Date.now() - startTime);
            return corsResponse;
          }

          let response: Response;

          if (path === '/health') {
            const origin = req.headers.get('Origin');
            response = await handleHealthCheck(requestId, origin);
          } else if (path === '/refresh') {
            const origin = req.headers.get('Origin');
            response = await handleRefreshRequest(requestId, origin);
          } else if (path === '/') {
            const origin = req.headers.get('Origin');
            response = new Response(
              JSON.stringify({
                requestId,
                timestamp: new Date().toISOString(),
                message: 'api.밥.net',
              }),
              {
                headers: {
                  ...getCorsHeaders(origin),
                  'Content-Type': 'application/json',
                },
              },
            );
          } else {
            const dateMatch = path.match(/^\/(\d{4}-\d{2}-\d{2})$/);
            if (dateMatch) {
              const origin = req.headers.get('Origin');
              response = await handleCafeteriaRequest(dateMatch[1], requestId, origin);
            } else {
              throw new ApiError(404, 'Endpoint not found');
            }
          }

          requestLogger.response(response.status, Date.now() - startTime);
          return response;
        } catch (error) {
          const duration = Date.now() - startTime;
          requestLogger.error(`Request failed after ${duration}ms`, error);
          const origin = req.headers.get('Origin');
          return handleError(error, requestId, origin);
        }
      },
    });

    const shutdown = async () => {
      logger.info('Shutting down server');
      try {
        if (refreshJob) clearTimeout(refreshJob);
        await mongoDB.disconnect();
        logger.info('Server shutdown complete');
      } catch (error) {
        logger.error('Error during shutdown', error);
      }
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    return server;
  } catch (error) {
    logger.error('Server initialization failed', error);
    throw error;
  }
}
