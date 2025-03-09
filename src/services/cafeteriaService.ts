import * as cheerio from 'cheerio';
import type {MenuPost, MealMenu, MealImages} from '../types';
import { CONFIG } from '../config';
import { fetchWithTimeout } from '../utils/fetchUtils';
import { getKSTDate, formatDate } from '../utils/dateUtils';
import { memoryCache } from '../utils/cache-utils';

export async function getLatestMenuDocumentIds(
  pageUrl = `${CONFIG.BASE_URL}?mid=${CONFIG.CAFETERIA_PATH}`
): Promise<MenuPost[]> {
  const cacheKey = 'cafeteria_menu_posts';
  const cachedData = memoryCache.get<MenuPost[]>(cacheKey);

  if (cachedData) {
    console.log('Using cached menu posts data');
    return cachedData;
  }

  try {
    const response = await fetchWithTimeout(pageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch menu documents: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const posts = $('.scContent .scEllipsis a')
      .map((_, element) => {
        const link = $(element).attr('href');
        const documentId = link?.match(/document_srl=(\d+)/)?.[1];
        if (!documentId) return null;

        const title = $(element).text().trim();
        if (!title.includes('식단')) return null;

        return {
          documentId,
          title,
          date: $(element).closest('tr').find('td:nth-child(6)').text().trim()
        };
      })
      .get()
      .filter((post): post is MenuPost => post !== null);

    memoryCache.set(cacheKey, posts);

    return posts;
  } catch (error) {
    console.error('Error fetching menu documents:', error);
    throw new Error('Failed to fetch menu documents');
  }
}

export function findTargetPost(menuPosts: MenuPost[], dateParam: string): MenuPost | undefined {
  return menuPosts.find(post => {
    const match = post.title.match(/(\d+)월\s*(\d+)일/);
    if (!match) return false;

    const [, month, day] = match;
    const currentYear = getKSTDate().getFullYear();
    const postDate = new Date(currentYear, parseInt(month) - 1, parseInt(day));
    return formatDate(postDate) === formatDate(new Date(dateParam));
  });
}

export async function getMealData(documentId: string): Promise<{ menu: MealMenu; images: MealImages }> {
  const cacheKey = `meal_data_${documentId}`;
  const cachedData = memoryCache.get<{ menu: MealMenu; images: MealImages }>(cacheKey);

  if (cachedData) {
    console.log(`Using cached meal data for document ${documentId}`);
    return cachedData;
  }

  try {
    const url = `${CONFIG.BASE_URL}?mid=${CONFIG.CAFETERIA_PATH}&document_srl=${documentId}`;
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch meal data: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // ------------------
    // 식단 텍스트 파싱
    // ------------------
    const contentLines = $('.xe_content')
      .text()
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);

    const getMealText = (prefix: string): string => {
      const mealLine = contentLines.find(line => line.startsWith(`*${prefix}:`));
      return mealLine ? mealLine.replace(`*${prefix}:`, '').trim() : '';
    };

    const menu: MealMenu = {
      breakfast: getMealText(CONFIG.MEAL_TYPES.BREAKFAST),
      lunch: getMealText(CONFIG.MEAL_TYPES.LUNCH),
      dinner: getMealText(CONFIG.MEAL_TYPES.DINNER)
    };

    const images: MealImages = {
      breakfast: '',
      lunch: '',
      dinner: ''
    };

    $('.xe_content img').each((_, element) => {
      const imgSrc = $(element).attr('src');
      const imgAlt = $(element).attr('alt')?.toLowerCase() || '';

      if (imgSrc) {
        if (imgAlt.includes('조')) {
          images.breakfast = new URL(imgSrc, 'https://www.dimigo.hs.kr').toString();
        } else if (imgAlt.includes('중')) {
          images.lunch = new URL(imgSrc, 'https://www.dimigo.hs.kr').toString();
        } else if (imgAlt.includes('석')) {
          images.dinner = new URL(imgSrc, 'https://www.dimigo.hs.kr').toString();
        }
      }
    });

    const result = { menu, images };

    memoryCache.set(cacheKey, result);

    return result;
  } catch (error) {
    console.error('Error fetching meal data:', error);
    throw new Error('Failed to fetch meal data');
  }
}