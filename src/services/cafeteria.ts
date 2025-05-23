import * as cheerio from 'cheerio';
import { CONFIG } from '../config';
import type { CafeteriaResponse, MenuPost, ProcessedMealMenu } from '../types';
import { cache } from '../utils/cache';
import { formatDate, parseKoreanDate } from '../utils/date';
import { fetchWithRetry } from '../utils/fetch';
import { logger } from '../utils/logger';

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
    parser: async (response) => response.text(),
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
        date: $(element).closest('tr').find('td:nth-child(6)').text().trim(),
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

  return menuPosts.find((post) => {
    const postDate = parseKoreanDate(post.title);
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

export async function getMealData(documentId: string): Promise<CafeteriaResponse> {
  const cacheKey = `meal_data_${documentId}`;

  const cachedData = cache.get<CafeteriaResponse>(cacheKey);
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

  const processedMenu: ProcessedMealMenu = {
    breakfast: { regular: [], simple: [], image: '' },
    lunch: { regular: [], simple: [], image: '' },
    dinner: { regular: [], simple: [], image: '' },
  };

  let currentMealType: 'breakfast' | 'lunch' | 'dinner' | null = null;

  for (let i = 0; i < contentLines.length; i++) {
    const line = contentLines[i];

    if (line.startsWith(`*${CONFIG.MEAL_TYPES.BREAKFAST}:`)) {
      currentMealType = 'breakfast';
      const mealText = line.replace(`*${CONFIG.MEAL_TYPES.BREAKFAST}:`, '').trim();

      const simpleMealIndex = mealText.indexOf('<간편식>');
      if (simpleMealIndex !== -1) {
        const regularText = mealText.substring(0, simpleMealIndex).trim();
        const simpleText = mealText.substring(simpleMealIndex + 5).trim();

        processedMenu.breakfast.regular = parseMenu(regularText);
        processedMenu.breakfast.simple = parseMenu(simpleText);
      } else {
        processedMenu.breakfast.regular = parseMenu(mealText);
      }
    } else if (line.startsWith(`*${CONFIG.MEAL_TYPES.LUNCH}:`)) {
      currentMealType = 'lunch';
      const mealText = line.replace(`*${CONFIG.MEAL_TYPES.LUNCH}:`, '').trim();

      const simpleMealIndex = mealText.indexOf('<간편식>');
      if (simpleMealIndex !== -1) {
        const regularText = mealText.substring(0, simpleMealIndex).trim();
        const simpleText = mealText.substring(simpleMealIndex + 5).trim();

        processedMenu.lunch.regular = parseMenu(regularText);
        processedMenu.lunch.simple = parseMenu(simpleText);
      } else {
        processedMenu.lunch.regular = parseMenu(mealText);
      }
    } else if (line.startsWith(`*${CONFIG.MEAL_TYPES.DINNER}:`)) {
      currentMealType = 'dinner';
      const mealText = line.replace(`*${CONFIG.MEAL_TYPES.DINNER}:`, '').trim();

      const simpleMealIndex = mealText.indexOf('<간편식>');
      if (simpleMealIndex !== -1) {
        const regularText = mealText.substring(0, simpleMealIndex).trim();
        const simpleText = mealText.substring(simpleMealIndex + 5).trim();

        processedMenu.dinner.regular = parseMenu(regularText);
        processedMenu.dinner.simple = parseMenu(simpleText);
      } else {
        processedMenu.dinner.regular = parseMenu(mealText);
      }
    } else if (line.startsWith('<간편식>') && currentMealType) {
      const simpleText = line.replace('<간편식>', '').trim();
      const simpleItems = parseMenu(simpleText);

      if (currentMealType === 'breakfast') {
        processedMenu.breakfast.simple = simpleItems;
      } else if (currentMealType === 'lunch') {
        processedMenu.lunch.simple = simpleItems;
      } else if (currentMealType === 'dinner') {
        processedMenu.dinner.simple = simpleItems;
      }
    }
  }

  // Process images directly into each meal object
  $('.xe_content img').each((_, element) => {
    const imgSrc = $(element).attr('src');
    const imgAlt = $(element).attr('alt')?.toLowerCase() || '';

    if (imgSrc) {
      const fullUrl = new URL(imgSrc, 'https://www.dimigo.hs.kr').toString();

      if (imgAlt.includes('조')) {
        processedMenu.breakfast.image = fullUrl;
      } else if (imgAlt.includes('중')) {
        processedMenu.lunch.image = fullUrl;
      } else if (imgAlt.includes('석')) {
        processedMenu.dinner.image = fullUrl;
      }
    }
  });

  // Create response with the new structure
  const result: CafeteriaResponse = {
    breakfast: processedMenu.breakfast,
    lunch: processedMenu.lunch,
    dinner: processedMenu.dinner,
  };

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

    const hasPreviousDate = menuPosts.some((post) => {
      const postDate = parseKoreanDate(post.title);
      return postDate && postDate < targetDate;
    });

    const hasLaterDate = menuPosts.some((post) => {
      const postDate = parseKoreanDate(post.title);
      return postDate && postDate > targetDate;
    });

    if (hasPreviousDate && hasLaterDate) {
      throw new Error('NO_OPERATION');
    }
    throw new Error('NO_INFORMATION');
  }

  // Get meal data directly in the new structure
  const mealData = await getMealData(targetPost.documentId);

  cache.set(cacheKey, mealData);

  return mealData;
}
