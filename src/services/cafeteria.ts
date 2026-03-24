import * as cheerio from "cheerio";
import { MealNoOperationError, MealNotFoundError } from "@/middleware/error";
import { CONFIG } from "@/shared/lib/config";
import { logger } from "@/shared/lib/logger";
import { mongoDB } from "@/shared/lib/mongodb";
import type { CafeteriaData, MenuPost, ProcessedMealMenu } from "@/shared/types";
import { formatDate } from "@/shared/utils/date";
import { fetchWithRetry } from "@/shared/utils/fetch";

function calculateMenuDate(title: string, registrationDateStr: string): Date | null {
  const monthDayMatch = title.match(/(\d{1,2})월\s*(\d{1,2})일/);
  if (!monthDayMatch) return null;

  const menuMonth = parseInt(monthDayMatch[1], 10);
  const menuDay = parseInt(monthDayMatch[2], 10);

  const registrationDate = new Date(registrationDateStr);
  const registrationYear = registrationDate.getFullYear();
  const registrationMonth = registrationDate.getMonth() + 1;

  let menuYear = registrationYear;

  if (registrationMonth === 12 && menuMonth === 1) {
    menuYear = registrationYear + 1;
  } else if (registrationMonth === 1 && menuMonth === 12) {
    menuYear = registrationYear - 1;
  }

  return new Date(menuYear, menuMonth - 1, menuDay);
}

export async function getLatestMenuPosts(): Promise<MenuPost[]> {
  const timer = logger.time();
  const allPosts: MenuPost[] = [];

  try {
    for (let page = CONFIG.WEBSITE.PAGE_RANGE.START; page <= CONFIG.WEBSITE.PAGE_RANGE.END; page++) {
      const url = `${CONFIG.WEBSITE.BASE_URL}/${CONFIG.WEBSITE.LIST_PATH}`;

      const html = await fetchWithRetry<string>(url, {
        method: "POST",
        body: new URLSearchParams({
          currPage: String(page),
          mi: "13609",
          bbsId: "6909",
        }).toString(),
        parser: async (response) => response.text(),
        solveCaptcha: true,
      });

      const $ = cheerio.load(html);
      const posts = $(".BD_list tbody tr")
        .map((_, row) => {
          const linkElement = $(row).find(".ta_l a");
          const documentId = linkElement.attr("data-id");
          if (!documentId) return null;

          const title = linkElement.text().trim();
          if (!title.includes("식단")) return null;

          const registrationDate = $(row).find("td:nth-child(4)").text().trim();

          const menuDate = calculateMenuDate(title, registrationDate);
          if (!menuDate) return null;

          return {
            documentId,
            title,
            date: formatDate(menuDate),
            registrationDate,
            parsedDate: menuDate,
          };
        })
        .get()
        .filter((post): post is MenuPost & { parsedDate: Date } => post !== null);

      allPosts.push(...posts);
      logger.info(`Fetched ${posts.length} menu posts from page ${page}`);
    }

    timer(
      `Fetched total ${allPosts.length} menu posts from pages ${CONFIG.WEBSITE.PAGE_RANGE.START}-${CONFIG.WEBSITE.PAGE_RANGE.END}`,
    );
    return allPosts;
  } catch (error) {
    logger.error("Failed to fetch menu posts", error);
    throw error;
  }
}

function findMenuPostForDate(menuPosts: MenuPost[], dateParam: string): MenuPost | undefined {
  const targetDate = new Date(dateParam);
  const targetDateStr = formatDate(targetDate);

  return menuPosts.find((post) => {
    return post.date === targetDateStr;
  });
}

const parseMenu = (menuStr: string): string[] => {
  if (!menuStr) return [];

  const items: string[] = [];
  let current = "";
  let parenDepth = 0;

  for (let i = 0; i < menuStr.length; i++) {
    const char = menuStr[i];

    if (char === "(") {
      parenDepth++;
      current += char;
    } else if (char === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      current += char;
    } else if (char === "/" && parenDepth === 0) {
      if (current.trim()) {
        items.push(current.trim());
      }
      current = "";
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
  const mealLogger = logger.operation("parse-meal", dateKey);
  const timer = mealLogger.time();

  try {
    const url = `${CONFIG.WEBSITE.BASE_URL}/${CONFIG.WEBSITE.INFO_PATH}?mi=13609&bbsId=6909&nttSn=${documentId}`;

    const html = await fetchWithRetry<string>(url, {
      method: "POST",
      parser: async (response) => response.text(),
    });

    const $ = cheerio.load(html);
    const pElements = $(".bbsV_cont p");
    const contentLines =
      pElements.length > 0
        ? pElements
            .map((_, el) => $(el).text().trim())
            .get()
            .filter(Boolean)
        : $(".bbsV_cont")
            .text()
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);

    const processedMenu: ProcessedMealMenu = {
      breakfast: { regular: [], simple: [], plus: [], image: "" },
      lunch: { regular: [], simple: [], plus: [], image: "" },
      dinner: { regular: [], simple: [], plus: [], image: "" },
    };

    const parseMealSection = (lines: string[], startIndex: number, mealType: string) => {
      const mealLine = lines[startIndex].replaceAll(/\u00A0/g, "").replaceAll(" ", "");
      const mealText = mealLine.replace(`*${mealType}:`, "").trim();

      const regular = parseMenu(mealText);
      let simple: string[] = [];
      let plus: string[] = [];

      for (let i = startIndex + 1; i < lines.length; i++) {
        const line = lines[i].replaceAll(/\u00A0/g, "").replaceAll(" ", "");

        if (
          line.startsWith(`*${CONFIG.MEAL_TYPES.BREAKFAST}:`) ||
          line.startsWith(`*${CONFIG.MEAL_TYPES.LUNCH}:`) ||
          line.startsWith(`*${CONFIG.MEAL_TYPES.DINNER}:`)
        ) {
          break;
        }

        if (line.includes("<셀프바>") || line.includes("<플러스바>")) {
          const delimiter = line.includes("<셀프바>") ? "<셀프바>" : "<플러스바>";
          const parts = line.split(delimiter);
          if (parts.length > 1) {
            const plusMealText = parts[1].trim();
            plus = parseMenu(plusMealText);
          }
          continue;
        }

        if (line.includes("<간편식>")) {
          const parts = line.split("<간편식>");
          if (parts.length > 1) {
            const simpleMealText = parts[1].trim();
            simple = parseMenu(simpleMealText);
          }
          continue;
        }

        if (simple.length > 0 || plus.length > 0 || line === "") {
          continue;
        }
        break;
      }

      return { regular, simple, plus };
    };

    for (let i = 0; i < contentLines.length; i++) {
      const line = contentLines[i].replaceAll(/\u00A0/g, "").replaceAll(" ", "");

      if (line.startsWith(`*${CONFIG.MEAL_TYPES.BREAKFAST}:`)) {
        const { regular, simple, plus } = parseMealSection(contentLines, i, CONFIG.MEAL_TYPES.BREAKFAST);
        processedMenu.breakfast.regular = regular;
        processedMenu.breakfast.simple = simple;
        processedMenu.breakfast.plus = plus;
      } else if (line.startsWith(`*${CONFIG.MEAL_TYPES.LUNCH}:`)) {
        const { regular, simple, plus } = parseMealSection(contentLines, i, CONFIG.MEAL_TYPES.LUNCH);
        processedMenu.lunch.regular = regular;
        processedMenu.lunch.simple = simple;
        processedMenu.lunch.plus = plus;
      } else if (line.startsWith(`*${CONFIG.MEAL_TYPES.DINNER}:`)) {
        const { regular, simple, plus } = parseMealSection(contentLines, i, CONFIG.MEAL_TYPES.DINNER);
        processedMenu.dinner.regular = regular;
        processedMenu.dinner.simple = simple;
        processedMenu.dinner.plus = plus;
      }
    }

    $(".bbsV_cont img").each((_, element) => {
      const imgSrc = $(element).attr("src");
      const imgAlt = $(element).attr("alt")?.toLowerCase() || "";

      if (imgSrc) {
        try {
          const fullUrl = new URL(imgSrc, CONFIG.WEBSITE.BASE_URL).toString();
          if (imgAlt.includes("조")) processedMenu.breakfast.image = fullUrl;
          else if (imgAlt.includes("중")) processedMenu.lunch.image = fullUrl;
          else if (imgAlt.includes("석")) processedMenu.dinner.image = fullUrl;
        } catch {
          mealLogger.warn(`Failed to parse image URL: ${imgSrc}`);
        }
      }
    });

    const result: CafeteriaData = {
      breakfast: processedMenu.breakfast,
      lunch: processedMenu.lunch,
      dinner: processedMenu.dinner,
    };

    const isAllMealsEmpty =
      processedMenu.breakfast.regular.length === 0 &&
      processedMenu.breakfast.simple.length === 0 &&
      processedMenu.breakfast.plus.length === 0 &&
      processedMenu.lunch.regular.length === 0 &&
      processedMenu.lunch.simple.length === 0 &&
      processedMenu.lunch.plus.length === 0 &&
      processedMenu.dinner.regular.length === 0 &&
      processedMenu.dinner.simple.length === 0 &&
      processedMenu.dinner.plus.length === 0;

    if (isAllMealsEmpty) {
      const existingData = await mongoDB.getMealData(dateKey);
      if (existingData) {
        mealLogger.info("All meals are empty, preserving existing data");
        timer("Preserved existing meal data (empty refresh result)");
        return existingData;
      }
    }

    await mongoDB.saveMealData(dateKey, result, documentId);
    timer("Parsed and saved meal data");

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
    throw new MealNotFoundError();
  }

  const targetDate = new Date(dateParam);
  const earliestDate = new Date(earliest);
  const latestDate = new Date(latest);

  if (targetDate < earliestDate || targetDate > latestDate) {
    throw new MealNotFoundError();
  }

  throw new MealNoOperationError();
}

export async function fetchAndSaveCafeteriaData(dateParam: string, menuPosts: MenuPost[]): Promise<CafeteriaData> {
  const targetPost = findMenuPostForDate(menuPosts, dateParam);

  if (!targetPost) {
    const targetDate = new Date(dateParam);

    const postDates = menuPosts
      .map((post) => new Date(post.date))
      .filter((date): date is Date => !Number.isNaN(date.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());

    if (postDates.length === 0) {
      throw new MealNotFoundError();
    }

    const earliestDate = postDates[0];
    const latestDate = postDates[postDates.length - 1];

    if (targetDate < earliestDate || targetDate > latestDate) {
      throw new MealNotFoundError();
    }

    throw new MealNoOperationError();
  }

  return await getMealData(targetPost.documentId, dateParam);
}

export async function refreshSpecificDate(dateParam: string): Promise<CafeteriaData> {
  const documentId = await mongoDB.getDocumentId(dateParam);

  if (!documentId) {
    throw new MealNotFoundError();
  }

  return await getMealData(documentId, dateParam);
}
