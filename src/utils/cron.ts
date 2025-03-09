// utils/cron.ts
import { memoryCache } from './cache-utils';
import { getLatestMenuDocumentIds } from '../services/cafeteriaService';

async function refreshCafeteriaData() {
  console.log('Cron job: Refreshing cafeteria data...');

  try {
    // 캐시 전체 비우기
    memoryCache.clear();

    // 기본 데이터 미리 로드 (메뉴 목록을 미리 가져와 캐시)
    await getLatestMenuDocumentIds();

    console.log('Cron job: Cafeteria data successfully refreshed');
  } catch (error) {
    console.error('Cron job: Error refreshing data:', error);
  }
}

export function setupCronJob(intervalMs: number = 30 * 60 * 1000) {
  console.log(`Setting up cron job to refresh data every ${intervalMs / 60000} minutes`);

  // 서버 시작 시 즉시 실행
  refreshCafeteriaData().catch((err) => console.error('Initial data refresh failed:', err));

  // 주기적으로 실행
  return setInterval(refreshCafeteriaData, intervalMs);
}