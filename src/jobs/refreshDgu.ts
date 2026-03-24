import { refreshDguCafeteriaData } from "@/services/dgu";
import { CONFIG } from "@/shared/lib/config";
import { logger } from "@/shared/lib/logger";
import { formatDate, getWeekDates } from "@/shared/utils/date";

export async function runDguRefresh(refreshType: "today" | "all" = "all"): Promise<void> {
  const refreshLogger = logger.operation("dgu-refresh");
  const timer = refreshLogger.time();

  try {
    refreshLogger.info(`Starting DGU cafeteria data refresh (${refreshType})`);

    const today = formatDate(new Date());
    const dates = refreshType === "all" ? getWeekDates(today) : [today];

    let successCount = 0;
    let errorCount = 0;

    for (const date of dates) {
      try {
        refreshLogger.info(`Processing DGU ${date}`);
        await refreshDguCafeteriaData(date);
        refreshLogger.info(`✓ Completed DGU ${date}`);
        successCount++;
      } catch (error) {
        errorCount++;
        refreshLogger.error(`✗ Failed DGU ${date}`, error);
      }
    }

    timer(`DGU refresh completed (${refreshType}): ${successCount} success, ${errorCount} errors`);
  } catch (error) {
    refreshLogger.error("DGU cafeteria refresh failed", error);
    throw error;
  }
}

function getNextRunTime(): { timeMs: number; refreshType: "today" | "all" } {
  const now = new Date();
  const schedules = CONFIG.DGU.REFRESH.SCHEDULE;
  let nextRunTime = Number.MAX_SAFE_INTEGER;
  let nextRefreshType: "today" | "all" = "all";

  for (const schedule of schedules) {
    const next = new Date(now);
    const currentDay = now.getDay();
    const targetDay = schedule.day;
    const targetHour = schedule.hour;
    const targetMinute = schedule.minute;

    const daysUntilTarget = (targetDay - currentDay + 7) % 7;

    if (
      currentDay === targetDay &&
      (now.getHours() < targetHour || (now.getHours() === targetHour && now.getMinutes() < targetMinute))
    ) {
      next.setHours(targetHour, targetMinute, 0, 0);
    } else {
      next.setDate(next.getDate() + (daysUntilTarget || 7));
      next.setHours(targetHour, targetMinute, 0, 0);
    }

    const timeUntilNext = next.getTime() - now.getTime();
    if (timeUntilNext < nextRunTime) {
      nextRunTime = timeUntilNext;
      nextRefreshType = schedule.refreshType;
    }
  }

  return { timeMs: nextRunTime, refreshType: nextRefreshType };
}

function scheduleNextRun(): NodeJS.Timeout {
  const { timeMs, refreshType } = getNextRunTime();
  const nextRunDate = new Date(Date.now() + timeMs);

  logger.info(`Next DGU refresh: ${nextRunDate.toLocaleString()} (${refreshType})`);

  return <NodeJS.Timeout>setTimeout(async () => {
    try {
      await runDguRefresh(refreshType);
    } catch (error) {
      logger.error("Scheduled DGU refresh failed", error);
    } finally {
      scheduleNextRun();
    }
  }, timeMs);
}

export function setupDguRefreshJob(): NodeJS.Timeout | null {
  const schedules = CONFIG.DGU.REFRESH.SCHEDULE;
  const scheduleInfo = schedules
    .map((s) => `day ${s.day} at ${s.hour}:${s.minute.toString().padStart(2, "0")} (${s.refreshType})`)
    .join(", ");

  logger.info(`Setting up DGU refresh job: ${scheduleInfo}`);

  runDguRefresh().catch((error) => {
    logger.error("Initial DGU refresh failed", error);
  });

  return scheduleNextRun();
}
