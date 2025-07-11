import * as cheerio from 'cheerio';
import { CONFIG } from '../config';
import type { CafeteriaData, MenuPost, ProcessedMealMenu } from '../types';
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

const parseMenu = (menuStr: string): string[] => {
  if (!menuStr) return [];

  const items: string[] = [];
  let current = '';
  let parenDepth = 0;

  for (let i = 0; i < menuStr.length; i++) {
    const char = menuStr[i];

    if (char === '(') {
      parenDepth++;
      current += char;
    } else if (char === ')') {
      parenDepth--;
      current += char;
    } else if (char === '/' && parenDepth === 0) {
      if (current.trim()) {
        items.push(current.trim());
      }
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    items.push(current.trim());
  }

  return items;
};

async function getMealData(documentId: string, dateKey: string): Promise<CafeteriaData> {
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

      const regular = parseMenu(mealText);
      let simple: string[] = [];

      for (let i = startIndex + 1; i < lines.length; i++) {
        const line = lines[i];

        if (line.startsWith('*조식:') || line.startsWith('*중식:') || line.startsWith('*석식:')) {
          break;
        }

        if (/^<간편식>\s*/.test(line)) {
          const simpleMealText = line.replace(/^<간편식>\s*/, '').trim();
          simple = parseMenu(simpleMealText);
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

    const result: CafeteriaData = {
      breakfast: processedMenu.breakfast,
      lunch: processedMenu.lunch,
      dinner: processedMenu.dinner,
    };

    await mongoDB.saveMealData(dateKey, result, documentId);
    timer('Parsed and saved meal data');

    return result;
  } catch (error) {
    logger.error(`Failed to get meal data for ${dateKey}`, error);
    throw error;
  }
}

export async function getCafeteriaData(dateParam: string): Promise<CafeteriaData> {
  const cachedData = await mongoDB.getMealData(dateParam);
  if (cachedData) {
    return cachedData;
  }

  const { earliest, latest } = await mongoDB.getDateRange();

  if (!earliest || !latest) {
    throw new Error('NO_INFORMATION');
  }

  const targetDate = new Date(dateParam);
  const earliestDate = new Date(earliest);
  const latestDate = new Date(latest);

  if (targetDate < earliestDate || targetDate > latestDate) {
    throw new Error('NO_INFORMATION');
  }

  throw new Error('NO_OPERATION');
}

export async function fetchAndSaveCafeteriaData(dateParam: string, menuPosts: MenuPost[]): Promise<CafeteriaData> {
  const targetPost = findMenuPostForDate(menuPosts, dateParam);

  if (!targetPost) {
    const targetDate = new Date(dateParam);

    const postDates = menuPosts
      .map((post) => parseKoreanDate(post.title))
      .filter((date): date is Date => date !== null)
      .sort((a, b) => a.getTime() - b.getTime());

    if (postDates.length === 0) {
      throw new Error('NO_INFORMATION');
    }

    const earliestDate = postDates[0];
    const latestDate = postDates[postDates.length - 1];

    if (targetDate < earliestDate || targetDate > latestDate) {
      throw new Error('NO_INFORMATION');
    }

    throw new Error('NO_OPERATION');
  }

  return await getMealData(targetPost.documentId, dateParam);
}
