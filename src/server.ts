import { serve } from "bun";
import { CONFIG } from "@/core/config";
import { getCorsHeaders, handleCors } from "@/core/cors";
import { ApiError, MealNoOperationError, MealNotFoundError, handleError } from "@/core/errors";
import { logger } from "@/core/logger";
import { setupScheduler } from "@/core/scheduler";
import type { HealthCheckResponse, MealResponse } from "@/core/types";
import { initializeRegistry } from "@/providers/registry";
import { isValidDate } from "@/utils/date";

function generateRequestId(): string {
  return Math.random().toString(36).substring(2, 10);
}

export async function createServer() {
  logger.info("Starting server initialization");

  try {
    const registry = initializeRegistry();
    const providers = registry.getProviders();

    for (const provider of providers) {
      await provider.init();
    }

    const schedulerHandles: (NodeJS.Timeout | null)[] = [];
    for (const provider of providers) {
      const handle = setupScheduler(
        provider.config.id,
        provider.config.schedule,
        (type) => provider.runRefresh(type),
      );
      schedulerHandles.push(handle);
    }

    logger.info(`Server running at http://${CONFIG.SERVER.HOST}:${CONFIG.SERVER.PORT}`);
    logger.info(`Registered providers: ${providers.map((p) => p.config.id).join(", ")}`);

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

          const origin = req.headers.get("Origin");

          if (path === "/") {
            const response = new Response(
              JSON.stringify({
                requestId,
                timestamp: new Date().toISOString(),
                message: "api.밥.net",
              }),
              {
                headers: {
                  ...getCorsHeaders(origin),
                  "Content-Type": "application/json",
                },
              },
            );
            requestLogger.response(response.status, Date.now() - startTime);
            return response;
          }

          const provider = registry.findByPath(path);
          if (!provider) {
            throw new ApiError(404, "Endpoint not found");
          }

          const subPath = registry.getSubPath(provider, path);
          let response: Response;

          if (subPath === "/health") {
            const stats = await provider.getStats();
            const body: HealthCheckResponse = {
              requestId,
              timestamp: new Date().toISOString(),
              status: "ok",
              database: {
                connected: true,
                totalMealData: stats.totalMealData,
                lastUpdated: stats.lastUpdated,
              },
            };
            response = new Response(JSON.stringify(body), {
              headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
            });
          } else {
            const refreshMatch = subPath.match(/^\/refresh\/(\d{4}-\d{2}-\d{2})$/);
            const dateMatch = subPath.match(/^\/(\d{4}-\d{2}-\d{2})$/);

            if (refreshMatch && method === "POST") {
              const apiKey = req.headers.get("Authorization")?.replace("Bearer ", "");
              if (!CONFIG.REFRESH_API_KEY || apiKey !== CONFIG.REFRESH_API_KEY) {
                throw new ApiError(401, "Unauthorized");
              }

              const date = refreshMatch[1];
              if (!isValidDate(date)) {
                throw new ApiError(400, "Invalid date format");
              }

              const data = await provider.refreshMealData(date);
              const body: MealResponse = { requestId, timestamp: new Date().toISOString(), date, data };
              response = new Response(JSON.stringify(body), {
                headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
              });
            } else if (dateMatch) {
              const date = dateMatch[1];
              if (!isValidDate(date)) {
                throw new ApiError(400, "Invalid date format");
              }

              try {
                const data = await provider.getMealData(date);
                const body: MealResponse = { requestId, timestamp: new Date().toISOString(), date, data };
                response = new Response(JSON.stringify(body), {
                  headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
                });
              } catch (error) {
                if (error instanceof MealNoOperationError) {
                  throw new ApiError(404, error.message);
                }
                if (error instanceof MealNotFoundError) {
                  throw new ApiError(404, error.message);
                }
                throw error;
              }
            } else if (provider.handleExtraRoute) {
              const extraResponse = await provider.handleExtraRoute(subPath, method, requestId, origin);
              if (extraResponse) {
                response = extraResponse;
              } else {
                throw new ApiError(404, "Endpoint not found");
              }
            } else {
              throw new ApiError(404, "Endpoint not found");
            }
          }

          requestLogger.response(response.status, Date.now() - startTime);
          return response;
        } catch (error) {
          const duration = Date.now() - startTime;
          requestLogger.error(`Request failed after ${duration}ms`, error);
          const origin = req.headers.get("Origin");
          return handleError(error, requestId, origin);
        }
      },
    });

    const shutdown = async () => {
      logger.info("Shutting down server");
      try {
        for (const handle of schedulerHandles) {
          if (handle) clearTimeout(handle);
        }
        for (const provider of providers) {
          await provider.shutdown();
        }
        logger.info("Server shutdown complete");
      } catch (error) {
        logger.error("Error during shutdown", error);
      }
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    return server;
  } catch (error) {
    logger.error("Server initialization failed", error);
    throw error;
  }
}
