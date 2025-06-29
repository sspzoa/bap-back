import * as cheerio from 'cheerio';
import { CONFIG } from '../config';
import type { CafeteriaResponse, MenuPost, ProcessedMealMenu } from '../types';
import { formatDate, parseKoreanDate } from '../utils/date';
import { fetchWithRetry } from '../utils/fetch';
import { logger } from '../utils/logger';
import { mongoDB } from '../utils/mongodb';

export async function getLatestMenuPosts(): Promise<MenuPost[]> {
  const timer = logger.time();

  try {
    const url = `${CONFIG.WEBSITE.BASE_URL}?mid=${CONFIG.WEBSITE.CAFETERIA_PATH}`;

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

    timer(`Fetched ${posts.length} menu posts`);
    return posts;
  } catch (error) {
    logger.error('Failed to fetch menu posts', error);
    throw error;
  }
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
  const mealLogger = logger.operation('parse-meal', dateKey);
  const timer = mealLogger.time();

  try {
    const url = `${CONFIG.WEBSITE.BASE_URL}?mid=${CONFIG.WEBSITE.CAFETERIA_PATH}&document_srl=${documentId}`;

    const html = await fetchWithRetry<string>(url, {
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

    for (let i = 0; i < contentLines.length; i++) {
      const line = contentLines[i];

      if (line.startsWith(`*${CONFIG.MEAL_TYPES.BREAKFAST}:`)) {
        const { regular, simple } = parseMealSection(contentLines, i, CONFIG.MEAL_TYPES.BREAKFAST);
        processedMenu.breakfast.regular = regular;
        processedMenu.breakfast.simple = simple;
      } else if (line.startsWith(`*${CONFIG.MEAL_TYPES.LUNCH}:`)) {
        const { regular, simple } = parseMealSection(contentLines, i, CONFIG.MEAL_TYPES.LUNCH);
        processedMenu.lunch.regular = regular;
        processedMenu.lunch.simple = simple;
      } else if (line.startsWith(`*${CONFIG.MEAL_TYPES.DINNER}:`)) {
        const { regular, simple } = parseMealSection(contentLines, i, CONFIG.MEAL_TYPES.DINNER);
        processedMenu.dinner.regular = regular;
        processedMenu.dinner.simple = simple;
      }
    }

    $('.xe_content img').each((_, element) => {
      const imgSrc = $(element).attr('src');
      const imgAlt = $(element).attr('alt')?.toLowerCase() || '';

      if (imgSrc) {
        const fullUrl = new URL(imgSrc, 'https://www.dimigo.hs.kr').toString();
        if (imgAlt.includes('조')) processedMenu.breakfast.image = fullUrl;
        else if (imgAlt.includes('중')) processedMenu.lunch.image = fullUrl;
        else if (imgAlt.includes('석')) processedMenu.dinner.image = fullUrl;
      }
    });

    const result: CafeteriaResponse = {
      breakfast: processedMenu.breakfast,
      lunch: processedMenu.lunch,
      dinner: processedMenu.dinner,
    };

    await mongoDB.saveMealData(dateKey, result, documentId);
    timer(`Parsed and saved meal data`);

    return result;
  } catch (error) {
    logger.error(`Failed to get meal data for ${dateKey}`, error);
    throw error;
  }
}

export async function getCafeteriaData(dateParam: string): Promise<CafeteriaResponse> {
  const cachedData = await mongoDB.getMealData(dateParam);
  if (cachedData) {
    return cachedData;
  }

  throw new Error('NO_INFORMATION');
}

export async function fetchAndSaveCafeteriaData(
  dateParam: string,
  menuPosts: MenuPost[]
): Promise<CafeteriaResponse> {
  const targetPost = findMenuPostForDate(menuPosts, dateParam);

  if (!targetPost) {
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

  return await getMealData(targetPost.documentId, dateParam);
}