import type { CafeteriaResponse } from '../types';
import { cache } from '../utils/cache';
import { logger } from '../utils/logger';

export async function getCafeteriaData(dateParam: string): Promise<CafeteriaResponse | null> {
  const cacheKey = `cafeteria_${dateParam}`;

  const cachedData = cache.get<CafeteriaResponse>(cacheKey);
  if (cachedData) {
    logger.info(`Using cached cafeteria data for date ${dateParam}`);
    return cachedData;
  }

  logger.info(`No cafeteria data found for date ${dateParam}`);
  return null;
}

export async function saveCafeteriaData(dateParam: string, data: CafeteriaResponse): Promise<void> {
  const cacheKey = `cafeteria_${dateParam}`;

  // Save to cache with extended TTL since data is manually managed
  cache.set(cacheKey, data, 7 * 24 * 60 * 60 * 1000); // 7 days

  logger.info(`Saved cafeteria data for date ${dateParam}`);
}

export async function deleteCafeteriaData(dateParam: string): Promise<boolean> {
  const cacheKey = `cafeteria_${dateParam}`;

  if (!cache.has(cacheKey)) {
    return false;
  }

  cache.delete(cacheKey);
  logger.info(`Deleted cafeteria data for date ${dateParam}`);

  return true;
}