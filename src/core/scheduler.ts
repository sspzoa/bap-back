import { logger } from "@/core/logger";
import type { ScheduleEntry } from "@/providers/types";

function getNextRunTime(schedules: ScheduleEntry[]): { timeMs: number; refreshType: "today" | "all" } {
  const now = new Date();
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

export function setupScheduler(
  providerId: string,
  schedule: ScheduleEntry[],
  refreshFn: (type: "today" | "all") => Promise<void>,
): NodeJS.Timeout | null {
  if (schedule.length === 0) return null;

  const scheduleInfo = schedule
    .map((s) => `day ${s.day} at ${s.hour}:${s.minute.toString().padStart(2, "0")} (${s.refreshType})`)
    .join(", ");

  logger.info(`[${providerId}] Setting up refresh job: ${scheduleInfo}`);

  refreshFn("all").catch((error) => {
    logger.error(`[${providerId}] Initial refresh failed`, error);
  });

  function scheduleNextRun(): NodeJS.Timeout {
    const { timeMs, refreshType } = getNextRunTime(schedule);
    const nextRunDate = new Date(Date.now() + timeMs);

    logger.info(`[${providerId}] Next refresh: ${nextRunDate.toLocaleString()} (${refreshType})`);

    return <NodeJS.Timeout>setTimeout(async () => {
      try {
        await refreshFn(refreshType);
      } catch (error) {
        logger.error(`[${providerId}] Scheduled refresh failed`, error);
      } finally {
        scheduleNextRun();
      }
    }, timeMs);
  }

  return scheduleNextRun();
}
