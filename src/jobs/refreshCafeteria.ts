import { getLatestMenuPosts, getMealData } from '../services/cafeteria';
import { cache } from '../utils/cache';
import { formatDate, parseKoreanDate } from '../utils/date';
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

export function setupRefreshJob(intervalMs: number): NodeJS.Timeout {
  logger.info(`Setting up cafeteria data refresh job to run every ${intervalMs / 60000} minutes`);

  refreshCafeteriaData().catch((error) => {
    logger.error('Initial cafeteria data refresh failed:', error);
  });

  return <NodeJS.Timeout>setInterval(refreshCafeteriaData, intervalMs);
}
