import * as cheerio from 'cheerio';
import { CONFIG } from '../config';
import type { CafeteriaResponse, MealImages, MealMenu, MenuPost, ProcessedMeal, ProcessedMealMenu } from '../types';
import { cache } from '../utils/cache';
import { formatDate, parseKoreanDate } from '../utils/date';
import { fetchWithRetry } from '../utils/fetch';
import { logger } from '../utils/logger';

export async function getLatestMenuPosts(
  options: { startPage?: number; endPage?: number; useCache?: boolean } = {},
): Promise<MenuPost[]> {
  const { startPage = 1, endPage = 1, useCache = true } = options;
  const cacheKey = 'cafeteria_menu_posts';

  if (useCache && startPage === 1 && endPage === 1) {
    const cachedData = cache.get<MenuPost[]>(cacheKey);
    if (cachedData) {
      logger.info('Using cached menu posts data');
      return cachedData;
    }
  }

  let allPosts: MenuPost[] = [];

  for (let page = startPage; page <= endPage; page++) {
    logger.info(`Fetching menu posts from page ${page}`);
    const url = `${CONFIG.WEBSITE.BASE_URL}?mid=${CONFIG.WEBSITE.CAFETERIA_PATH}&page=${page}`;

    const html = await fetchWithRetry<string>(url, {
      timeout: CONFIG.HTTP.TIMEOUT * 2,
      parser: async (response) => response.text(),
    });

    const $ = cheerio.load(html);

    const pagePosts = $('.scContent .scEllipsis a')
      .map((_, element) => {
        const link = $(element).attr('href');
        const documentId = link?.match(/document_srl=(\d+)/)?.[1];
        if (!documentId) return null;

        const title = $(element).text().trim();
        if (!title.includes('식단')) return null;

        return {
          documentId,
          title,
          date: $(element).closest('tr').find('td:nth-child(6)').text().trim(),
        };
      })
      .get()
      .filter((post): post is MenuPost => post !== null);

    allPosts = [...allPosts, ...pagePosts];

    if (pagePosts.length === 0) {
      logger.warn(`No menu posts found on page ${page}, stopping pagination`);
      break;
    }
  }

  allPosts = allPosts.filter((post, index, self) => index === self.findIndex((p) => p.documentId === post.documentId));

  if (allPosts.length > 0) {
    const initialDates: Array<{ post: MenuPost; date: Date | null }> = allPosts.map((post) => ({
      post,
      date: parseKoreanDate(post.title),
    }));

    const validInitialDates = initialDates
      .filter((item) => item.date !== null)
      .sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0));

    if (validInitialDates.length > 0) {
      const parsedDates: Date[] = [];

      for (const item of validInitialDates) {
        const correctedDate = parseKoreanDate(item.post.title, parsedDates);
        if (correctedDate) {
          parsedDates.push(correctedDate);
        }
      }
    }

    if (startPage === 1) {
      cache.set(cacheKey, allPosts);
    }
    logger.info(`Found ${allPosts.length} menu posts across pages ${startPage}-${endPage}`);
  } else {
    logger.warn('No menu posts found on the website');
  }

  return allPosts;
}

export function findMenuPostForDate(menuPosts: MenuPost[], dateParam: string): MenuPost | undefined {
  const targetDate = new Date(dateParam);
  const previouslyParsedDates: Date[] = [];

  for (const post of menuPosts) {
    const date = parseKoreanDate(post.title, previouslyParsedDates);
    if (date) {
      previouslyParsedDates.push(date);
    }
  }

  previouslyParsedDates.sort((a, b) => b.getTime() - a.getTime());

  return menuPosts.find((post) => {
    const postDate = parseKoreanDate(post.title, previouslyParsedDates);
    if (!postDate) return false;

    return formatDate(postDate) === formatDate(targetDate);
  });
}

const parseMenu = (menuStr: string): string[] => {
  return menuStr
    ? menuStr
        .split(/\/(?![^()]*\))/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
};

const processMealItems = (items: string[], mealType: string): ProcessedMeal => {
  const keywordList = ['샌드위치', '죽', '닭가슴살', '선식'];

  const count = mealType === '아침' ? 5 : 3;

  const allItemsCount = items.length;
  const recentItems = items.slice(Math.max(0, allItemsCount - count));
  const nonRecentItems = items.slice(0, Math.max(0, allItemsCount - count));

  const simpleMeals = recentItems.filter(
    (item) =>
      keywordList.some((keyword) => item.includes(keyword)) || (item.includes('샐러드') && !item.includes('샐러드바')),
  );

  const regularRecentItems = recentItems.filter(
    (item) =>
      !(
        keywordList.some((keyword) => item.includes(keyword)) ||
        (item.includes('샐러드') && !item.includes('샐러드바'))
      ),
  );

  const regularMeals = [...nonRecentItems, ...regularRecentItems];

  return {
    regular: regularMeals,
    simple: simpleMeals,
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
    parser: async (response) => response.text(),
  });

  const $ = cheerio.load(html);

  const contentLines = $('.xe_content')
    .text()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const getMealText = (prefix: string): string => {
    const mealLine = contentLines.find((line) => line.startsWith(`*${prefix}:`));
    return mealLine ? mealLine.replace(`*${prefix}:`, '').trim() : '';
  };

  const rawMenu: MealMenu = {
    breakfast: getMealText(CONFIG.MEAL_TYPES.BREAKFAST),
    lunch: getMealText(CONFIG.MEAL_TYPES.LUNCH),
    dinner: getMealText(CONFIG.MEAL_TYPES.DINNER),
  };

  const breakfastItems = parseMenu(rawMenu.breakfast);
  const lunchItems = parseMenu(rawMenu.lunch);
  const dinnerItems = parseMenu(rawMenu.dinner);

  const processedMenu: ProcessedMealMenu = {
    breakfast: processMealItems(breakfastItems, '아침'),
    lunch: { regular: lunchItems, simple: [] },
    dinner: processMealItems(dinnerItems, '저녁'),
  };

  const images: MealImages = {
    breakfast: '',
    lunch: '',
    dinner: '',
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

    const targetDate = new Date(dateParam);
    const previouslyParsedDates: Date[] = [];

    for (const post of menuPosts) {
      const date = parseKoreanDate(post.title, previouslyParsedDates);
      if (date) {
        previouslyParsedDates.push(date);
      }
    }

    previouslyParsedDates.sort((a, b) => b.getTime() - a.getTime());

    const hasPreviousDate = menuPosts.some((post) => {
      const postDate = parseKoreanDate(post.title, previouslyParsedDates);
      return postDate && postDate < targetDate;
    });

    const hasLaterDate = menuPosts.some((post) => {
      const postDate = parseKoreanDate(post.title, previouslyParsedDates);
      return postDate && postDate > targetDate;
    });

    if (hasPreviousDate && hasLaterDate) {
      throw new Error('NO_OPERATION');
    }
    throw new Error('NO_INFORMATION');
  }

  const { meals, images } = await getMealData(targetPost.documentId);
  const responseData: CafeteriaResponse = { meals, images };

  cache.set(cacheKey, responseData);

  return responseData;
}
