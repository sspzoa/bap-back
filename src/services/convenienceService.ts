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

export interface AllConvenienceMealData {
  [date: string]: ConvenienceMealData;
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

function extractDatesFromCafeteriaKeys(keys: string[]): string[] {
  const dateRegex = /cafeteria_(\d{4}-\d{2}-\d{2})/;

  return keys.reduce((dates, key) => {
    const match = key.match(dateRegex);
    if (match && match[1]) {
      dates.push(match[1]);
    }
    return dates;
  }, [] as string[]);
}

export async function getAllConvenienceMealData(): Promise<AllConvenienceMealData> {
  const allDataCacheKey = 'convenience_all_data';
  const cachedAllData = sqliteCache.get<AllConvenienceMealData>(allDataCacheKey);

  if (cachedAllData) {
    console.log('Using cached all convenience meal data');
    return cachedAllData;
  }

  const allCacheKeys = sqliteCache.getAllKeys();
  const availableDates = extractDatesFromCafeteriaKeys(allCacheKeys);

  console.log(`Found ${availableDates.length} dates to fetch convenience data for`);

  const allConvenienceData: AllConvenienceMealData = {};

  for (const date of availableDates) {
    try {
      const cachedData = sqliteCache.get<ConvenienceMealData>(`convenience_${date}`);

      if (cachedData) {
        allConvenienceData[date] = cachedData;
        continue;
      }

      const data = await getConvenienceMealData(date);

      if (data) {
        allConvenienceData[date] = data;
      }
    } catch (error) {
      console.error(`Error fetching convenience data for ${date}:`, error);
    }
  }

  if (Object.keys(allConvenienceData).length > 0) {
    sqliteCache.set(allDataCacheKey, allConvenienceData);
  }

  return allConvenienceData;
}