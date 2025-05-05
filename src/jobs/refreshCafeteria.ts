import { getLatestMenuPosts, getMealData } from '../services/cafeteria';
import { cache } from '../utils/cache';
import { formatDate, getKSTDate, parseKoreanDate } from '../utils/date';
import { logger } from '../utils/logger';

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
        logger.info(`Pre-fetching menu data for ${dateKey} (${post.title})`);

        const mealData = await getMealData(post.documentId);
        cache.set(`cafeteria_${dateKey}`, mealData);
      } catch (error) {
        logger.error(`Error pre-fetching menu for post ${post.title}:`, error);
      }
    }

    logger.info('Cafeteria data refresh job completed successfully');
  } catch (error) {
    logger.error('Cafeteria data refresh job failed:', error);
    throw error;
  }
}

function getNextScheduleTime(): Date {
  const now = getKSTDate();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const milliseconds = now.getMilliseconds();

  const targetHours = [6, 12, 18];

  const nextHour = targetHours.find((h) => h > hours);

  if (!nextHour) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(6, 0, 0, 0);
    return tomorrow;
  }

  const nextRunTime = new Date(now);
  nextRunTime.setHours(nextHour, 0, 0, 0);

  return nextRunTime;
}

function getMillisecondsUntilNextRun(): number {
  const nextRunTime = getNextScheduleTime();
  const now = getKSTDate();

  return nextRunTime.getTime() - now.getTime();
}

export function setupRefreshJob(): NodeJS.Timeout {
  logger.info('Setting up cafeteria data refresh job to run at 6:00, 12:00, and 18:00 KST');

  refreshCafeteriaData().catch((error) => {
    logger.error('Initial cafeteria data refresh failed:', error);
  });

  const msUntilNextRun = getMillisecondsUntilNextRun();
  const nextRunTime = new Date(getKSTDate().getTime() + msUntilNextRun);

  logger.info(`Next cafeteria data refresh scheduled at ${nextRunTime.toISOString()}`);

  return <NodeJS.Timeout>setTimeout(function runScheduledJob() {
    refreshCafeteriaData().catch((error) => {
      logger.error('Scheduled cafeteria data refresh failed:', error);
    });

    const nextMs = getMillisecondsUntilNextRun();
    const nextTime = new Date(getKSTDate().getTime() + nextMs);

    logger.info(`Next cafeteria data refresh scheduled at ${nextTime.toISOString()}`);

    setTimeout(runScheduledJob, nextMs);
  }, msUntilNextRun);
}
