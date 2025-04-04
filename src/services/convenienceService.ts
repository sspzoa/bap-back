// services/convenienceService.ts
import { sqliteCache } from '../utils/sqlite-cache';
import cloudscraper from 'cloudscraper';

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

async function fetchWithCloudscraper(url: string, timeout = 30000): Promise<any> {
  const options = {
    uri: url,
    method: 'GET',
    timeout: timeout,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      'Referer': 'https://lightsail.aws.amazon.com/'
    },
    cloudflareTimeout: 10000,
    cloudflareMaxTimeout: 30000,
    followAllRedirects: true,
    resolveWithFullResponse: false,
    json: true
  };

  try {
    const response = await cloudscraper(options);
    return response;
  } catch (error) {
    console.error('Cloudscraper error:', error);
    throw error;
  }
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
    console.log(`Fetching convenience meal data with Cloudscraper for ${dateParam}`);
    const data = await fetchWithCloudscraper(url);
    sqliteCache.set(cacheKey, data);
    return data as ConvenienceMealData;
  } catch (error: unknown) {
    console.error(`Error fetching convenience meal data for ${dateParam} (attempt ${4 - retryCount}):`, error);

    if (retryCount > 0) {
      console.log(`Retrying fetch for convenience meal data (date ${dateParam})...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      return getConvenienceMealData(dateParam, retryCount - 1);
    }

    console.error('Failed to fetch convenience meal data after multiple attempts');
    return null;
  }
}