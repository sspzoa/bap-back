import { getLatestMenuPosts, getMealData } from '../services/cafeteria';
import { cache } from '../utils/cache';
import { formatDate, parseKoreanDate } from '../utils/date';
import { logger } from '../utils/logger';
import { closeBrowser } from '../utils/fetch';

export async function refreshCafeteriaData(): Promise<void> {
  logger.info('Starting cafeteria data refresh job');

  try {
    cache.clear();

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
        const cacheKey = `cafeteria_${dateKey}`;

        if (cache.has(cacheKey)) {
          logger.info(`Menu data for ${dateKey} already cached, skipping`);
          continue;
        }

        logger.info(`Pre-fetching menu data for ${dateKey} (${post.title})`);

        const mealData = await getMealData(post.documentId);
        cache.set(cacheKey, mealData);
        logger.info(`Successfully cached menu data for ${dateKey}`);
      } catch (error) {
        logger.error(`Error pre-fetching menu for post ${post.title}:`, error);
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
  const now = new Date();
  const next = new Date();

  next.setHours(18, 0, 0, 0);

  if (now >= next) {
    next.setDate(next.getDate() + 1);
  }

  return next.getTime() - now.getTime();
}

function scheduleNextRun(): NodeJS.Timeout {
  const timeUntilNext = getNextRunTime();
  const nextRunDate = new Date(Date.now() + timeUntilNext);

  logger.info(`Next cafeteria data refresh scheduled for: ${nextRunDate.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`);

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
  logger.info('Setting up cafeteria data refresh job to run daily at 3:00 AM');

  refreshCafeteriaData().catch((error) => {
    logger.error('Initial cafeteria data refresh failed:', error);
  });

  return scheduleNextRun();
}