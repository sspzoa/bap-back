// services/convenienceService.ts
import { fetchWithTimeout } from '../utils/fetchUtils';
import { sqliteCache } from '../utils/sqlite-cache';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

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

async function fetchWithPuppeteer(url: string, timeout = 30000): Promise<any> {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(timeout);
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
    await page.goto(url, { waitUntil: 'networkidle2' });

    await page.waitForFunction(() => {
      return !document.querySelector('div.main-wrapper') ||
        document.title !== 'Just a moment...';
    }, { timeout });

    const content = await page.content();

    try {
      const bodyText = await page.evaluate(() => document.body.innerText);
      return JSON.parse(bodyText);
    } catch (e) {
      console.log('Content not JSON, extracting manually');

      const jsonMatch = content.match(/{[\s\S]*}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      throw new Error('Failed to extract JSON from response');
    }
  } finally {
    await browser.close();
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
    console.log(`Fetching convenience meal data with Puppeteer for ${dateParam}`);
    const data = await fetchWithPuppeteer(url);
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