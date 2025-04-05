// utils/cron.ts
import { sqliteCache } from './sqlite-cache';
import { getLatestMenuDocumentIds, findTargetPost, getMealData } from '../services/cafeteriaService';
import { formatDate } from './dateUtils';

async function refreshCafeteriaData() {
  console.log('Cron job: Refreshing cafeteria data...');

  try {
    const keys = sqliteCache.getAllKeys().filter(key =>
      key === 'cafeteria_menu_posts' ||
      key.startsWith('cafeteria_') ||
      key.startsWith('meal_data_') ||
      key.startsWith('combined_menu_')
    );

    for (const key of keys) {
      sqliteCache.delete(key);
    }

    const menuPosts = await getLatestMenuDocumentIds();
    console.log(`Found ${menuPosts.length} menu posts`);

    for (const post of menuPosts) {
      try {
        const match = post.title.match(/(\d+)월\s*(\d+)일/);
        if (!match) continue;

        const [, month, day] = match;
        const currentYear = new Date().getFullYear();
        const postDate = new Date(currentYear, parseInt(month) - 1, parseInt(day));
        const dateKey = formatDate(postDate);

        console.log(`Pre-fetching menu data for ${dateKey} (${post.title})`);
        const { menu, images } = await getMealData(post.documentId);

        const responseData = {
          ...menu,
          images
        };

        sqliteCache.set(`cafeteria_${dateKey}`, responseData);

      } catch (error) {
        console.error(`Error pre-fetching menu for post ${post.title}:`, error);
        continue;
      }
    }

    console.log('Cron job: All cafeteria data successfully refreshed and cached');
  } catch (error) {
    console.error('Cron job: Error refreshing data:', error);
  }
}

export function setupCronJob(intervalMs: number = 5 * 60 * 1000) {
  console.log(`Setting up cron job to refresh data every ${intervalMs / 60000} minutes`);

  refreshCafeteriaData().catch((err) => console.error('Initial data refresh failed:', err));

  return setInterval(refreshCafeteriaData, intervalMs);
}