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

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      'Origin': 'https://lightsail.aws.amazon.com',
      'Referer': 'https://lightsail.aws.amazon.com/',
      'sec-ch-ua': '"Google Chrome";v="121", "Not A(Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'Content-Type': 'application/json'
    };
    
    const response = await fetchWithTimeout(url, { 
      timeout: 5000,
      headers
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`Convenience meal data not found for ${dateParam}`);
        return null;
      }
      
      const errorText = await response.text().catch(() => 'Could not read response text');
      
      if (response.status === 403) {
        console.error(`=== 403 FORBIDDEN ERROR DETAILS ===`);
        console.error(`URL: ${url}`);
        console.error(`Response headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()))}`);
        console.error(`Response text: ${errorText}`);
        console.error(`Request headers: ${JSON.stringify(headers)}`);
        console.error(`=== END OF 403 ERROR DETAILS ===`);
      } else {
        console.error(`API error ${response.status}: ${errorText}`);
      }
      
      throw new Error(`Failed to fetch convenience meal data: ${response.status}`);
    }

    const data = await response.json() as ConvenienceMealData;

    if (!data || !data.morning || !data.evening) {
      console.error('Received invalid data format from API');
      return null;
    }

    sqliteCache.set(cacheKey, data);
    return data;
  } catch (error: unknown) {
    console.error(`Error fetching convenience meal data for ${dateParam} (attempt ${4 - retryCount}):`, error);

    if (retryCount > 0 && error instanceof Error && 
        (error.name === 'AbortError' || error.message.includes('Failed to fetch'))) {
      console.log(`Retrying fetch for convenience meal data (date ${dateParam})...`);
      await new Promise(resolve => setTimeout(resolve, 1500));
      return getConvenienceMealData(dateParam, retryCount - 1);
    }

    console.error('Failed to fetch convenience meal data after multiple attempts');

    const fallbackData = sqliteCache.get<ConvenienceMealData>('convenience_fallback');
    if (fallbackData) {
      console.log('Using fallback convenience meal data');
      return fallbackData;
    }
    
    return null;
  }
}