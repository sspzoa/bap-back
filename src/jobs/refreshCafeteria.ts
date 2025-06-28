import { getLatestMenuPosts, fetchAndSaveCafeteriaData } from '../services/cafeteria';
import { formatDate, parseKoreanDate, getKSTDate } from '../utils/date';
import { logger } from '../utils/logger';
import { closeBrowser } from '../utils/fetch';

export async function refreshCafeteriaData(): Promise<void> {
  logger.info('Starting cafeteria data refresh');
  const startTime = Date.now();

  try {
    const menuPosts = await getLatestMenuPosts();
    logger.info(`Found ${menuPosts.length} menu posts to process`);

    let successCount = 0;
    let errorCount = 0;

    for (const post of menuPosts) {
      try {
        const postDate = parseKoreanDate(post.title);
        if (!postDate) {
          logger.warn(`Unable to parse date from title: ${post.title}`);
          continue;
        }

        const dateKey = formatDate(postDate);
        logger.info(`Processing menu for ${dateKey} (${post.title})`);

        await fetchAndSaveCafeteriaData(dateKey, menuPosts);
        successCount++;
        logger.info(`Successfully saved menu for ${dateKey}`);
      } catch (error) {
        errorCount++;
        logger.error(`Failed to fetch menu for ${post.title}:`, error);
      }
    }

    const duration = Date.now() - startTime;
    logger.info(`Refresh completed in ${duration}ms - Success: ${successCount}, Errors: ${errorCount}`);
  } catch (error) {
    logger.error('Cafeteria refresh failed:', error);
    throw error;
  } finally {
    await closeBrowser();
    logger.info('Browser closed');
  }
}

function getNextRunTime(): number {
  const now = getKSTDate();
  const next = new Date(now);

  const targetDay = 6; // Saturday
  const targetHour = 3; // 3 AM

  next.setHours(targetHour, 0, 0, 0);

  const currentDay = now.getDay();
  const daysUntilSaturday = (targetDay - currentDay + 7) % 7;

  if (currentDay !== targetDay || now.getHours() >= targetHour) {
    next.setDate(next.getDate() + (daysUntilSaturday || 7));
  }

  return next.getTime() - now.getTime();
}

function scheduleNextRun(): NodeJS.Timeout {
  const timeUntilNext = getNextRunTime();
  const nextRunDate = new Date(getKSTDate().getTime() + timeUntilNext);

  logger.info(`Next refresh scheduled for: ${nextRunDate.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`);

  return <NodeJS.Timeout>setTimeout(async () => {
    logger.info('Executing scheduled refresh');
    try {
      await refreshCafeteriaData();
    } catch (error) {
      logger.error('Scheduled refresh failed:', error);
    } finally {
      scheduleNextRun();
    }
  }, timeUntilNext);
}

export function setupRefreshJob(): NodeJS.Timeout | null {
  logger.info('Setting up cafeteria refresh job (weekly, Saturday 3AM KST)');

  refreshCafeteriaData().catch((error) => {
    logger.error('Initial refresh failed:', error);
  });

  return scheduleNextRun();
}