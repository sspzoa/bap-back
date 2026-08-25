import { serve } from "bun";
import { CONFIG } from "@/core/config";
import { buildApiDocs } from "@/core/docs";
import { getCorsHeaders, handleCors } from "@/core/cors";
import { ApiError, handleError } from "@/core/errors";
import { logger } from "@/core/logger";
import type { SchedulerHandle } from "@/core/scheduler";
import { setupScheduler } from "@/core/scheduler";
import type { HealthCheckResponse, MealResponse } from "@/core/types";
import { initializeRegistry } from "@/providers/init";
import { formatDate, isValidDate } from "@/utils/date";

function jsonResponse(body: unknown, origin: string | null, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(origin),
      "Content-Type": "application/json",
    },
  });
}

export async function createServer() {
  logger.info("Starting server initialization");

  try {
    const registry = initializeRegistry();
    const providers = registry.getProviders();

    for (const provider of providers) {
      await provider.init();
    }

    const schedulerHandles: (SchedulerHandle | null)[] = [];

    const server = serve({
      port: CONFIG.SERVER.PORT,

      async fetch(req: Request) {
        const url = new URL(req.url);
        const path = url.pathname;
        const method = req.method;

        const requestLogger = logger.request(method, path);
        const requestId = requestLogger.context?.requestId ?? "unknown";
        const startTime = Date.now();

        try {
          const corsResponse = handleCors(req);
          if (corsResponse) {
            requestLogger.response(204, Date.now() - startTime);
            return corsResponse;
          }

          const origin = req.headers.get("Origin");

          if (path === "/") {
            const response = jsonResponse(
              {
                requestId,
                timestamp: new Date().toISOString(),
                message: "api.밥.net",
                providers: providers.map((provider) => provider.config.presentation),
              },
              origin,
            );
            requestLogger.response(response.status, Date.now() - startTime);
            return response;
          }

          if (path === "/docs" && method === "GET") {
            const presentations = providers.map((provider) => provider.config.presentation);
            const response = jsonResponse(
              {
                requestId,
                timestamp: new Date().toISOString(),
                providers: presentations,
                docs: buildApiDocs(presentations, CONFIG.PUBLIC_API_URL, formatDate(new Date())),
              },
              origin,
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
            response = jsonResponse(body, origin);
          } else {
            const dateMatch = subPath.match(/^\/(\d{4}-\d{2}-\d{2})$/);

            if (dateMatch && method === "GET") {
              const date = dateMatch[1];
              if (!isValidDate(date)) {
                throw new ApiError(400, "Invalid date format");
              }

              const data = await provider.getMealData(date);
              const body: MealResponse = { requestId, timestamp: new Date().toISOString(), date, data };
              response = jsonResponse(body, origin);
            } else if (provider.handleExtraRoute) {
              const extraPayload = await provider.handleExtraRoute(subPath, method);
              if (extraPayload && typeof extraPayload === "object") {
                response = jsonResponse(
                  {
                    requestId,
                    timestamp: new Date().toISOString(),
                    ...extraPayload,
                  },
                  origin,
                );
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

    for (const provider of providers) {
      const handle = setupScheduler(provider.config.id, provider.config.schedule, (type) => provider.runRefresh(type));
      schedulerHandles.push(handle);
    }

    logger.info(`Server running at http://${CONFIG.SERVER.HOST}:${CONFIG.SERVER.PORT}`);
    logger.info(`Registered providers: ${providers.map((p) => p.config.id).join(", ")}`);

    let shuttingDown = false;
    const shutdown = async () => {
      if (shuttingDown) return;
      shuttingDown = true;

      logger.info("Shutting down server");
      try {
        for (const handle of schedulerHandles) {
          handle?.cancel();
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

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);

    return server;
  } catch (error) {
    logger.error("Server initialization failed", error);
    throw error;
  }
}
