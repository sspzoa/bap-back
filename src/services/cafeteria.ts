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

  const parseMealSection = (lines: string[], startIndex: number, mealType: string) => {
    const mealLine = lines[startIndex];
    const mealText = mealLine.replace(`*${mealType}:`, '').trim();
    
    let regular = parseMenu(mealText);
    let simple: string[] = [];
    
    for (let i = startIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.startsWith('*조식:') || line.startsWith('*중식:') || line.startsWith('*석식:')) {
        break;
      }
      
      const simpleMealPatterns = [
        /^<간편식>\s*/,
        /^\[간편식\]\s*/,
        /^간편식:\s*/,
        /^간편식\s*-\s*/,
        /^\(간편식\)\s*/
      ];
      
      for (const pattern of simpleMealPatterns) {
        if (pattern.test(line)) {
          const simpleMealText = line.replace(pattern, '').trim();
          simple = parseMenu(simpleMealText);
          logger.info(`Found simple meal for ${mealType}: "${simpleMealText}"`);
          break;
        }
      }
      
      if (simple.length > 0 || line === '') {
        continue;
      }
      
      break;
    }
    
    return { regular, simple };
  };

  let mealCount = 0;
  for (let i = 0; i < contentLines.length; i++) {
    const line = contentLines[i];
    logger.debug(`Processing line ${i}: ${line}`);
    
    if (line.startsWith(`*${CONFIG.MEAL_TYPES.BREAKFAST}:`)) {
      const { regular, simple } = parseMealSection(contentLines, i, CONFIG.MEAL_TYPES.BREAKFAST);
      processedMenu.breakfast.regular = regular;
      processedMenu.breakfast.simple = simple;
      mealCount++;
      logger.info(`Breakfast - Regular: ${regular.length} items, Simple: ${simple.length} items`);
    } else if (line.startsWith(`*${CONFIG.MEAL_TYPES.LUNCH}:`)) {
      const { regular, simple } = parseMealSection(contentLines, i, CONFIG.MEAL_TYPES.LUNCH);
      processedMenu.lunch.regular = regular;
      processedMenu.lunch.simple = simple;
      mealCount++;
      logger.info(`Lunch - Regular: ${regular.length} items, Simple: ${simple.length} items`);
    } else if (line.startsWith(`*${CONFIG.MEAL_TYPES.DINNER}:`)) {
      const { regular, simple } = parseMealSection(contentLines, i, CONFIG.MEAL_TYPES.DINNER);
      processedMenu.dinner.regular = regular;
      processedMenu.dinner.simple = simple;
      mealCount++;
      logger.info(`Dinner - Regular: ${regular.length} items, Simple: ${simple.length} items`);
    }
  }

  logger.info(`Parsed ${mealCount} meal types`);

  logger.debug('Final processed menu:', {
    breakfast: {
      regular: processedMenu.breakfast.regular,
      simple: processedMenu.breakfast.simple
    },
    lunch: {
      regular: processedMenu.lunch.regular,
      simple: processedMenu.lunch.simple
    },
    dinner: {
      regular: processedMenu.dinner.regular,
      simple: processedMenu.dinner.simple
    }
  });

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