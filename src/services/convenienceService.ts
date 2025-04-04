// services/convenienceService.ts
import { fetchWithTimeout } from '../utils/fetchUtils';
import { sqliteCache } from '../utils/sqlite-cache';

interface ConvenienceMealItem {
  sandwich: string[];
  salad: string[];
  chicken: string[];
  grain: string[];
  etc: string[];
}

export interface ConvenienceMealData {
  morning: ConvenienceMealItem;
  evening: ConvenienceMealItem;
}

export async function getConvenienceMealData(
  dateParam: string,
  retryCount = 3
): Promise<ConvenienceMealData | null> {
  const cacheKey = `convenience_${dateParam}`;
  const cachedData = sqliteCache.get<ConvenienceMealData>(cacheKey);

  if (cachedData) {
    console.log(`Using cached convenience meal data for ${dateParam}`);
    return cachedData;
  }

  try {
    const url = `https://${process.env.CONVENIENCE_API_URL}/menu?date=${dateParam}`;
    const response = await fetchWithTimeout(url, { timeout: 5000 });

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`Convenience meal data not found for ${dateParam}`);
        return null;
      }
      throw new Error(`Failed to fetch convenience meal data: ${response.status}`);
    }

    const data = await response.json() as ConvenienceMealData;

    sqliteCache.set(cacheKey, data);

    return data;
  } catch (error: unknown) {
    console.error(`Error fetching convenience meal data for ${dateParam} (attempt ${4 - retryCount}):`, error);

    if (retryCount > 0 && error instanceof Error && error.name === 'AbortError') {
      console.log(`Retrying fetch for convenience meal data (date ${dateParam})...`);
      await new Promise(resolve => setTimeout(resolve, 1500));
      return getConvenienceMealData(dateParam, retryCount - 1);
    }

    console.error('Failed to fetch convenience meal data after multiple attempts');
    return null;
  }
}