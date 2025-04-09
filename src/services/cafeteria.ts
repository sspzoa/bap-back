import * as cheerio from 'cheerio';
import { CONFIG } from '../config';
import { logger } from '../utils/logger';
import { cache } from '../utils/cache';
import { fetchWithRetry } from '../utils/fetch';
import { formatDate, parseKoreanDate } from '../utils/date';
import type { MenuPost, MealMenu, MealImages, CafeteriaResponse } from '../types';

export async function getLatestMenuPosts(): Promise<MenuPost[]> {
  const cacheKey = 'cafeteria_menu_posts';

  const cachedData = cache.get<MenuPost[]>(cacheKey);
  if (cachedData) {
    logger.info('Using cached menu posts data');
    return cachedData;
  }

  const url = `${CONFIG.WEBSITE.BASE_URL}?mid=${CONFIG.WEBSITE.CAFETERIA_PATH}`;

  const html = await fetchWithRetry<string>(url, {
    timeout: CONFIG.HTTP.TIMEOUT * 2,
    parser: async (response) => response.text()
  });

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

  if (posts.length > 0) {
    cache.set(cacheKey, posts);
    logger.info(`Found ${posts.length} menu posts`);
  } else {
    logger.warn('No menu posts found on the website');
  }

  return posts;
}

export function findMenuPostForDate(menuPosts: MenuPost[], dateParam: string): MenuPost | undefined {
  const targetDate = new Date(dateParam);

  return menuPosts.find(post => {
    const postDate = parseKoreanDate(post.title);
    if (!postDate) return false;

    return formatDate(postDate) === formatDate(targetDate);
  });
}

export async function getMealData(documentId: string): Promise<{ menu: MealMenu; images: MealImages }> {
  const cacheKey = `meal_data_${documentId}`;

  const cachedData = cache.get<{ menu: MealMenu; images: MealImages }>(cacheKey);
  if (cachedData) {
    logger.info(`Using cached meal data for document ${documentId}`);
    return cachedData;
  }

  const url = `${CONFIG.WEBSITE.BASE_URL}?mid=${CONFIG.WEBSITE.CAFETERIA_PATH}&document_srl=${documentId}`;

  const html = await fetchWithRetry<string>(url, {
    timeout: CONFIG.HTTP.TIMEOUT * 2,
    parser: async (response) => response.text()
  });

  const $ = cheerio.load(html);

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
      const fullUrl = new URL(imgSrc, 'https://www.dimigo.hs.kr').toString();

      if (imgAlt.includes('조')) {
        images.breakfast = fullUrl;
      } else if (imgAlt.includes('중')) {
        images.lunch = fullUrl;
      } else if (imgAlt.includes('석')) {
        images.dinner = fullUrl;
      }
    }
  });

  const result = { menu, images };

  cache.set(cacheKey, result);
  logger.info(`Fetched meal data for document ${documentId}`);

  return result;
}

export async function getCafeteriaData(dateParam: string): Promise<CafeteriaResponse> {
  const cacheKey = `cafeteria_${dateParam}`;

  const cachedData = cache.get<CafeteriaResponse>(cacheKey);
  if (cachedData) {
    logger.info(`Using cached cafeteria data for date ${dateParam}`);
    return cachedData;
  }

  const menuPosts = await getLatestMenuPosts();
  const targetPost = findMenuPostForDate(menuPosts, dateParam);

  if (!targetPost) {
    logger.warn(`No menu post found for date ${dateParam}`);
    throw new Error(`Menu not found for date ${dateParam}`);
  }

  const { menu, images } = await getMealData(targetPost.documentId);
  const responseData: CafeteriaResponse = { ...menu, images };

  cache.set(cacheKey, responseData);

  return responseData;
}