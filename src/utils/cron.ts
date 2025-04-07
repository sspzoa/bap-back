// utils/cron.ts
import { sqliteCache } from './sqlite-cache';
import { getLatestMenuDocumentIds, findTargetPost, getMealData } from '../services/cafeteriaService';
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

        const responseData = { ...menu, images };
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

function isWithinActiveTimeRanges(): boolean {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const currentTime = hours * 60 + minutes; // Convert to minutes for easier comparison

  const activeRanges = [
    { start: 6 * 60 + 30, end: 7 * 60 + 30 },   // 06:30-07:30
    { start: 12 * 60, end: 13 * 60 },           // 12:00-13:00
    { start: 17 * 60 + 40, end: 18 * 60 + 40 }, // 17:40-18:40
  ];

  return activeRanges.some(range =>
    currentTime >= range.start && currentTime <= range.end
  );
}

export function setupCronJob(checkIntervalMs: number = 60 * 1000) { // Check every minute
  console.log('Setting up time-based cron job to refresh data during meal times');
  console.log('Active time ranges: 06:30-07:30, 12:00-13:00, 17:40-18:40');

  console.log('Initial run: Fetching cafeteria data on server startup...');
  refreshCafeteriaData().catch((err) => console.error('Initial data refresh failed:', err));

  return setInterval(() => {
    if (isWithinActiveTimeRanges()) {
      console.log('Current time is within active range, refreshing data...');
      refreshCafeteriaData().catch((err) => console.error('Scheduled data refresh failed:', err));
    } else {
      console.log('Current time is outside active ranges, skipping refresh');
    }
  }, checkIntervalMs);
}