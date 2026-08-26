import { CONFIG } from "@/core/config";
import { logger } from "@/core/logger";
import type { SchedulerHandle } from "@/core/scheduler";
import { setupScheduler } from "@/core/scheduler";
import { createApp } from "@/http/app";
import { createBapMcpHandler } from "@/mcp/handler";
import { sourcesFromProviders } from "@/mcp/server";
import { initializeRegistry } from "@/providers/init";

export async function createServer() {
  logger.info("Starting server initialization");

  try {
    const registry = initializeRegistry();
    const providers = registry.getProviders();

    for (const provider of providers) {
      await provider.init();
    }

    const schedulerHandles: (SchedulerHandle | null)[] = [];
    const mcpHandler = createBapMcpHandler({ sources: sourcesFromProviders(providers) });
    const app = createApp({ registry, mcpHandler });

    app.listen(CONFIG.SERVER.PORT);

    for (const provider of providers) {
      const handle = setupScheduler(provider.config.id, provider.config.schedule, (type) => provider.runRefresh(type));
      schedulerHandles.push(handle);
    }

    logger.info(`Server running at http://${CONFIG.SERVER.HOST}:${CONFIG.SERVER.PORT}`);
    logger.info(`Registered providers: ${providers.map((provider) => provider.config.id).join(", ")}`);

    let shuttingDown = false;
    const shutdown = async () => {
      if (shuttingDown) return;
      shuttingDown = true;

      logger.info("Shutting down server");
      try {
        await app.stop();
        await mcpHandler.close();
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

    return app;
  } catch (error) {
    logger.error("Server initialization failed", error);
    throw error;
  }
}
