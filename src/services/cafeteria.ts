import * as cheerio from 'cheerio';
import { CONFIG } from '../config';
import { logger } from '../utils/logger';
import { cache } from '../utils/cache';
import { fetchWithRetry } from '../utils/fetch';
import { formatDate, parseKoreanDate } from '../utils/date';
import type {
  MenuPost,
  MealMenu,
  MealImages,
  CafeteriaResponse,
  ProcessedMeal,
  ProcessedMealMenu
} from '../types';

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

const parseMenu = (menuStr: string): string[] => {
  return menuStr ? menuStr.split(/\/(?![^()]*\))/).map(item => item.trim()).filter(Boolean) : [];
};

const processMealItems = (items: string[], mealType: string): ProcessedMeal => {
  const keywordList = ["샌드위치", "죽", "닭가슴살", "선식"];

  const count = mealType === "아침" ? 5 : 3;

  const allItemsCount = items.length;
  const recentItems = items.slice(Math.max(0, allItemsCount - count));
  const nonRecentItems = items.slice(0, Math.max(0, allItemsCount - count));

  const simpleMeals = recentItems.filter(item =>
    keywordList.some(keyword => item.includes(keyword)) ||
    (item.includes("샐러드") && !item.includes("샐러드바"))
  );

  const regularRecentItems = recentItems.filter(item =>
    !(keywordList.some(keyword => item.includes(keyword)) ||
      (item.includes("샐러드") && !item.includes("샐러드바")))
  );

  const regularMeals = [...nonRecentItems, ...regularRecentItems];

  return {
    regular: regularMeals,
    simple: simpleMeals
  };
};

export async function getMealData(documentId: string): Promise<{ meals: ProcessedMealMenu; images: MealImages }> {
  const cacheKey = `meal_data_${documentId}`;

  const cachedData = cache.get<{ meals: ProcessedMealMenu; images: MealImages }>(cacheKey);
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

  const rawMenu: MealMenu = {
    breakfast: getMealText(CONFIG.MEAL_TYPES.BREAKFAST),
    lunch: getMealText(CONFIG.MEAL_TYPES.LUNCH),
    dinner: getMealText(CONFIG.MEAL_TYPES.DINNER)
  };

  // Process the raw menu into separated regular/simple meals
  const breakfastItems = parseMenu(rawMenu.breakfast);
  const lunchItems = parseMenu(rawMenu.lunch);
  const dinnerItems = parseMenu(rawMenu.dinner);

  const processedMenu: ProcessedMealMenu = {
    breakfast: processMealItems(breakfastItems, "아침"),
    lunch: { regular: lunchItems, simple: [] }, // Lunch doesn't have simple meals according to frontend logic
    dinner: processMealItems(dinnerItems, "저녁")
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

  const result = { meals: processedMenu, images };

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

  const { meals, images } = await getMealData(targetPost.documentId);
  const responseData: CafeteriaResponse = { meals, images };

  cache.set(cacheKey, responseData);

  return responseData;
}