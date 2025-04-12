import { getLatestMenuPosts, getMealData } from '../services/cafeteria';
import { cache } from '../utils/cache';
import { formatDate, parseKoreanDate } from '../utils/date';
import { logger } from '../utils/logger';

export async function refreshCafeteriaData(): Promise<void> {
  logger.info('Starting cafeteria data refresh job');

  try {
    const isFirstRun = !cache.has('initial_load_complete');

    const startPage = 1;
    const endPage = isFirstRun ? 10 : 1;

    logger.info(`${isFirstRun ? 'Initial load' : 'Refresh'}: fetching pages ${startPage}-${endPage}`);

    const menuPosts = await getLatestMenuPosts({
      startPage,
      endPage,
      useCache: false,
    });

    logger.info(`Found ${menuPosts.length} menu posts to process`);

    for (const post of menuPosts) {
      try {
        const postDate = parseKoreanDate(post.title);
        if (!postDate) {
          logger.warn(`Unable to parse date from post title: ${post.title}`);
          continue;
        }

        const dateKey = formatDate(postDate);
        const cafeteriaKey = `cafeteria_${dateKey}`;

        const existingData = cache.get(cafeteriaKey);

        logger.info(`Processing menu data for ${dateKey} (${post.title})`);
        const { meals, images } = await getMealData(post.documentId);
        const newData = { meals, images };

        if (!existingData || JSON.stringify(existingData) !== JSON.stringify(newData)) {
          logger.info(`Updating cache for ${dateKey} with new data`);
          cache.set(cafeteriaKey, newData);
        } else {
          logger.info(`No changes detected for ${dateKey}, keeping existing data`);
        }
      } catch (error) {
        logger.error(`Error processing menu for post ${post.title}:`, error);
      }
    }

    if (isFirstRun) {
      cache.set('initial_load_complete', { timestamp: Date.now() });
      logger.info('Initial data load completed and marked as done');
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
