import { getLatestMenuPosts, fetchAndSaveCafeteriaData } from '../services/cafeteria';
import { formatDate, parseKoreanDate } from '../utils/date';
import { logger } from '../utils/logger';
import { closeBrowser } from '../utils/fetch';

export async function refreshCafeteriaData(): Promise<void> {
  const refreshLogger = logger.operation('refresh');
  const timer = refreshLogger.time();

  try {
    refreshLogger.info('Starting cafeteria data refresh');

    const menuPosts = await getLatestMenuPosts();
    let successCount = 0;
    let errorCount = 0;

    for (const post of menuPosts) {
      try {
        const postDate = parseKoreanDate(post.title);
        if (!postDate) {
          refreshLogger.warn(`Cannot parse date: ${post.title}`);
          continue;
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

    timer(`Refresh completed: ${successCount} success, ${errorCount} errors`);

  } catch (error) {
    refreshLogger.error('Cafeteria refresh failed', error);
    throw error;
  } finally {
    await closeBrowser();
  }
}

function getNextRunTime(): number {
  const now = new Date();
  const targetDay = 6;
  const targetHour = 3;

  const next = new Date(now);
  const currentDay = now.getDay();
  const daysUntilSaturday = (targetDay - currentDay + 7) % 7;

  if (currentDay !== targetDay || now.getHours() >= targetHour) {
    next.setDate(next.getDate() + (daysUntilSaturday || 7));
  }

  next.setHours(targetHour, 0, 0, 0);
  return next.getTime() - now.getTime();
}

function scheduleNextRun(): NodeJS.Timeout {
  const timeUntilNext = getNextRunTime();
  const nextRunDate = new Date(Date.now() + timeUntilNext);

  logger.info(`Next refresh: ${nextRunDate.toLocaleString()}`);

  return <NodeJS.Timeout>setTimeout(async () => {
    try {
      await refreshCafeteriaData();
    } catch (error) {
      logger.error('Scheduled refresh failed', error);
    } finally {
      scheduleNextRun();
    }
  }, timeUntilNext);
}

export function setupRefreshJob(): NodeJS.Timeout | null {
  logger.info('Setting up weekly refresh job (Saturday 3AM)');

  refreshCafeteriaData().catch((error) => {
    logger.error('Initial refresh failed', error);
  });

  return scheduleNextRun();
}