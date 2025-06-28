import * as cheerio from 'cheerio';
import { CONFIG } from '../config';
import type { CafeteriaResponse, MenuPost, ProcessedMealMenu } from '../types';
import { formatDate, parseKoreanDate } from '../utils/date';
import { fetchWithRetry } from '../utils/fetch';
import { logger } from '../utils/logger';
import { mongoDB } from '../utils/mongodb';

export async function getLatestMenuPosts(): Promise<MenuPost[]> {
  const url = `${CONFIG.WEBSITE.BASE_URL}?mid=${CONFIG.WEBSITE.CAFETERIA_PATH}`;
  logger.info('Fetching menu posts from website');

  const html = await fetchWithRetry<string>(url, {
    parser: async (response) => response.text(),
    solveCaptcha: true,
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

  logger.info(`Extracted ${posts.length} valid menu posts`);
  return posts;
}

function findMenuPostForDate(menuPosts: MenuPost[], dateParam: string): MenuPost | undefined {
  const targetDate = new Date(dateParam);

  return menuPosts.find((post) => {
    const postDate = parseKoreanDate(post.title);
    return postDate && formatDate(postDate) === formatDate(targetDate);
  });
}

const parseMenu = (menuStr: string): string[] =>
  menuStr
    ? menuStr
      .split(/\/(?![^()]*\))/)
      .map((item) => item.trim())
      .filter(Boolean)
    : [];

async function getMealData(documentId: string, dateKey: string): Promise<CafeteriaResponse> {
  const url = `${CONFIG.WEBSITE.BASE_URL}?mid=${CONFIG.WEBSITE.CAFETERIA_PATH}&document_srl=${documentId}`;
  logger.info(`Fetching meal data for document ${documentId}`);

  const html = await fetchWithRetry<string>(url, {
    parser: async (response) => response.text(),
  });

  const $ = cheerio.load(html);

  const contentLines = $('.xe_content')
    .text()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  logger.info(`Parsing ${contentLines.length} content lines`);

  const processedMenu: ProcessedMealMenu = {
    breakfast: { regular: [], simple: [], image: '' },
    lunch: { regular: [], simple: [], image: '' },
    dinner: { regular: [], simple: [], image: '' },
  };

  const parseMealLine = (line: string, mealType: string) => {
    const mealText = line.replace(`*${mealType}:`, '').trim();
    const simpleMealIndex = mealText.indexOf('<간편식>');

    if (simpleMealIndex !== -1) {
      return {
        regular: parseMenu(mealText.substring(0, simpleMealIndex).trim()),
        simple: parseMenu(mealText.substring(simpleMealIndex + 5).trim())
      };
    }

    return {
      regular: parseMenu(mealText),
      simple: []
    };
  };

  let mealCount = 0;
  for (const line of contentLines) {
    if (line.startsWith(`*${CONFIG.MEAL_TYPES.BREAKFAST}:`)) {
      const { regular, simple } = parseMealLine(line, CONFIG.MEAL_TYPES.BREAKFAST);
      processedMenu.breakfast.regular = regular;
      processedMenu.breakfast.simple = simple;
      mealCount++;
    } else if (line.startsWith(`*${CONFIG.MEAL_TYPES.LUNCH}:`)) {
      const { regular, simple } = parseMealLine(line, CONFIG.MEAL_TYPES.LUNCH);
      processedMenu.lunch.regular = regular;
      processedMenu.lunch.simple = simple;
      mealCount++;
    } else if (line.startsWith(`*${CONFIG.MEAL_TYPES.DINNER}:`)) {
      const { regular, simple } = parseMealLine(line, CONFIG.MEAL_TYPES.DINNER);
      processedMenu.dinner.regular = regular;
      processedMenu.dinner.simple = simple;
      mealCount++;
    }
  }

  logger.info(`Parsed ${mealCount} meal types`);

  let imageCount = 0;
  $('.xe_content img').each((_, element) => {
    const imgSrc = $(element).attr('src');
    const imgAlt = $(element).attr('alt')?.toLowerCase() || '';

    if (imgSrc) {
      const fullUrl = new URL(imgSrc, 'https://www.dimigo.hs.kr').toString();

      if (imgAlt.includes('조')) {
        processedMenu.breakfast.image = fullUrl;
        imageCount++;
      } else if (imgAlt.includes('중')) {
        processedMenu.lunch.image = fullUrl;
        imageCount++;
      } else if (imgAlt.includes('석')) {
        processedMenu.dinner.image = fullUrl;
        imageCount++;
      }
    }
  });

  logger.info(`Found ${imageCount} meal images`);

  const result: CafeteriaResponse = {
    breakfast: processedMenu.breakfast,
    lunch: processedMenu.lunch,
    dinner: processedMenu.dinner,
  };

  await mongoDB.saveMealData(dateKey, result, documentId);
  logger.info(`Saved meal data for ${dateKey}`);

  return result;
}

export async function getCafeteriaData(dateParam: string): Promise<CafeteriaResponse> {
  logger.info(`Getting cafeteria data for ${dateParam}`);

  const cachedData = await mongoDB.getMealData(dateParam);
  if (cachedData) {
    logger.info(`Found cached data for ${dateParam}`);
    return cachedData;
  }

  logger.warn(`No data found for ${dateParam}`);
  throw new Error('NO_INFORMATION');
}

export async function fetchAndSaveCafeteriaData(
  dateParam: string,
  menuPosts: MenuPost[]
): Promise<CafeteriaResponse> {
  logger.info(`Fetching and saving data for ${dateParam}`);

  const targetPost = findMenuPostForDate(menuPosts, dateParam);

  if (!targetPost) {
    logger.warn(`No menu post found for ${dateParam}`);

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
      logger.info(`Date ${dateParam} falls between posts - no operation day`);
      throw new Error('NO_OPERATION');
    }

    logger.info(`No information available for ${dateParam}`);
    throw new Error('NO_INFORMATION');
  }

  logger.info(`Found post for ${dateParam}: ${targetPost.title}`);
  return await getMealData(targetPost.documentId, dateParam);
}