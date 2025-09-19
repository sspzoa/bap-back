import { CONFIG } from '../config';
import { fetchAndSaveCafeteriaData, getLatestMenuPosts } from '../services/cafeteria';
import { formatDate } from '../utils/date';
import { closeBrowser } from '../utils/fetch';
import { logger } from '../utils/logger';

export async function refreshCafeteriaData(refreshType: 'today' | 'all' = 'all'): Promise<void> {
  const refreshLogger = logger.operation('refresh');
  const timer = refreshLogger.time();

  try {
    refreshLogger.info(`Starting cafeteria data refresh (${refreshType})`);

    const menuPosts = await getLatestMenuPosts();
    let successCount = 0;
    let errorCount = 0;

    for (const post of menuPosts) {
      try {
        const postDate = new Date(post.date);
        if (isNaN(postDate.getTime())) {
          refreshLogger.warn(`Invalid date: ${post.date} for ${post.title}`);
          continue;
        }

        if (refreshType === 'today') {
          const today = new Date();
          const isToday = postDate.getDate() === today.getDate() &&
                         postDate.getMonth() === today.getMonth() &&
                         postDate.getFullYear() === today.getFullYear();

          if (!isToday) {
            continue;
          }
        }

        const dateKey = formatDate(postDate);
        refreshLogger.info(`Processing ${dateKey}`);
        await fetchAndSaveCafeteriaData(dateKey, menuPosts);
        refreshLogger.info(`✓ Completed ${dateKey}`);
        successCount++;
      } catch (error) {
        errorCount++;
        refreshLogger.error(`✗ Failed ${post.title}`, error);
      }
    }

    timer(`Refresh completed (${refreshType}): ${successCount} success, ${errorCount} errors`);
  } catch (error) {
    refreshLogger.error('Cafeteria refresh failed', error);
    throw error;
  } finally {
    await closeBrowser();
  }
}

function getNextRunTime(): { timeMs: number; refreshType: 'today' | 'all' } {
  const now = new Date();
  const schedules = CONFIG.REFRESH.SCHEDULE;
  let nextRunTime = Number.MAX_SAFE_INTEGER;
  let nextRefreshType: 'today' | 'all' = 'all';

  for (const schedule of schedules) {
    const next = new Date(now);
    const currentDay = now.getDay();
    const targetDay = schedule.day;
    const targetHour = schedule.hour;
    const targetMinute = schedule.minute;

    const daysUntilTarget = (targetDay - currentDay + 7) % 7;

    if (currentDay === targetDay && (now.getHours() < targetHour || (now.getHours() === targetHour && now.getMinutes() < targetMinute))) {
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

  logger.info(`Next refresh: ${nextRunDate.toLocaleString()} (${refreshType})`);

  return <NodeJS.Timeout>setTimeout(async () => {
    try {
      await refreshCafeteriaData(refreshType);
    } catch (error) {
      logger.error('Scheduled refresh failed', error);
    } finally {
      scheduleNextRun();
    }
  }, timeMs);
}

export function setupRefreshJob(): NodeJS.Timeout | null {
  const schedules = CONFIG.REFRESH.SCHEDULE;
  const scheduleInfo = schedules.map((s) => `day ${s.day} at ${s.hour}:${s.minute.toString().padStart(2, '0')} (${s.refreshType})`).join(', ');

  logger.info(`Setting up refresh job: ${scheduleInfo}`);

  refreshCafeteriaData().catch((error) => {
    logger.error('Initial refresh failed', error);
  });

  return scheduleNextRun();
}
