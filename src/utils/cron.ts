// utils/cron.ts
import { sqliteCache } from './sqlite-cache';
import { getLatestMenuDocumentIds, findTargetPost, getMealData } from '../services/cafeteriaService';
import { getConvenienceMealData } from '../services/convenienceService';
import { formatDate } from './dateUtils';

async function refreshCafeteriaData() {
  console.log('Cron job: Refreshing cafeteria data...');

  try {
    sqliteCache.clear();

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

        const convenienceMealData = await getConvenienceMealData(dateKey);

        const combinedMenu = { ...menu };

        if (convenienceMealData) {
          if (convenienceMealData.morning) {
            const morningItems = [
              ...(convenienceMealData.morning.sandwich || []).map(item => `[간편식] ${item}`),
              ...(convenienceMealData.morning.salad || []).map(item => `[간편식] ${item}`),
              ...(convenienceMealData.morning.chicken || []).map(item => `[간편식] ${item}`),
              ...(convenienceMealData.morning.grain || []).map(item => `[간편식] ${item}`),
              ...(convenienceMealData.morning.etc || []).map(item => `[간편식] ${item}`)
            ].filter(Boolean);

            if (morningItems.length > 0) {
              combinedMenu.breakfast = combinedMenu.breakfast
                ? `${combinedMenu.breakfast}/${morningItems.join('/')}`
                : morningItems.join('/');
            }
          }

          if (convenienceMealData.evening) {
            const eveningItems = [
              ...(convenienceMealData.evening.sandwich || []).map(item => `[간편식] ${item}`),
              ...(convenienceMealData.evening.salad || []).map(item => `[간편식] ${item}`),
              ...(convenienceMealData.evening.chicken || []).map(item => `[간편식] ${item}`),
              ...(convenienceMealData.evening.grain || []).map(item => `[간편식] ${item}`),
              ...(convenienceMealData.evening.etc || []).map(item => `[간편식] ${item}`)
            ].filter(Boolean);

            if (eveningItems.length > 0) {
              combinedMenu.dinner = combinedMenu.dinner
                ? `${combinedMenu.dinner}/${eveningItems.join('/')}`
                : eveningItems.join('/');
            }
          }
        }

        const responseData = {
          ...combinedMenu,
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