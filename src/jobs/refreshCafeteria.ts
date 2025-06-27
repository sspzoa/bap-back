import { getLatestMenuPosts, fetchAndSaveCafeteriaData } from '../services/cafeteria';
import { formatDate, parseKoreanDate, getKSTDate } from '../utils/date';
import { logger } from '../utils/logger';
import { closeBrowser } from '../utils/fetch';

export async function refreshCafeteriaData(): Promise<void> {
  logger.info('Starting cafeteria data refresh job');

  try {
    const menuPosts = await getLatestMenuPosts();
    logger.info(`Found ${menuPosts.length} menu posts to process`);

    for (const post of menuPosts) {
      try {
        const postDate = parseKoreanDate(post.title);
        if (!postDate) {
          logger.warn(`Unable to parse date from post title: ${post.title}`);
          continue;
        }

        const dateKey = formatDate(postDate);

        logger.info(`Fetching menu data for ${dateKey} (${post.title})`);
        await fetchAndSaveCafeteriaData(dateKey);
        logger.info(`Successfully saved menu data for ${dateKey}`);
      } catch (error) {
        logger.error(`Error fetching menu for post ${post.title}:`, error);
      }
    }

    logger.info('Cafeteria data refresh job completed successfully');

    await closeBrowser();
    logger.info('Browser closed after refresh completion');
  } catch (error) {
    logger.error('Cafeteria data refresh job failed:', error);
    await closeBrowser();
    logger.info('Browser closed after refresh failure');
    throw error;
  }
}

function getNextRunTime(): number {
  const now = getKSTDate();
  const next = new Date(now);

  const targetDay = 6;
  const targetHour = 3;

  next.setHours(targetHour, 0, 0, 0);

  const currentDay = now.getDay();
  const daysUntilSaturday = (targetDay - currentDay + 7) % 7;

  if (currentDay === targetDay && now.getHours() < targetHour) {

  } else {
    if (daysUntilSaturday === 0) {
      next.setDate(next.getDate() + 7);
    } else {
      next.setDate(next.getDate() + daysUntilSaturday);
    }
  }

  return next.getTime() - now.getTime();
}

function scheduleNextRun(): NodeJS.Timeout {
  const timeUntilNext = getNextRunTime();
  const nextRunKST = new Date(getKSTDate().getTime() + timeUntilNext);

  logger.info(`Next cafeteria data refresh scheduled for: ${nextRunKST.getFullYear()}. ${nextRunKST.getMonth() + 1}. ${nextRunKST.getDate()}. 오전 ${nextRunKST.getHours()}:${nextRunKST.getMinutes().toString().padStart(2, '0')}:${nextRunKST.getSeconds().toString().padStart(2, '0')} (KST)`);

  return <NodeJS.Timeout>setTimeout(() => {
    refreshCafeteriaData()
      .then(() => {
        logger.info('Scheduled cafeteria data refresh completed successfully');
      })
      .catch((error) => {
        logger.error('Scheduled cafeteria data refresh failed:', error);
      })
      .finally(() => {
        scheduleNextRun();
      });
  }, timeUntilNext);
}

export function setupRefreshJob(): NodeJS.Timeout | null {
  logger.info('Setting up cafeteria data refresh job to run weekly on Saturday at 3:00 AM KST');

  refreshCafeteriaData().catch((error) => {
    logger.error('Initial cafeteria data refresh failed:', error);
  });

  return scheduleNextRun();
}