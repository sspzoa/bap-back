import * as cheerio from "cheerio";
import { MealNoOperationError, MealNotFoundError } from "@/core/errors";
import { logger } from "@/core/logger";
import type { MongoDBService } from "@/core/mongodb";
import { KDMHS_WEBSITE, MEAL_TYPES } from "@/providers/kdmhs/config";
import type { CafeteriaData, FoodSearchResult, MealDataDocument, MenuPost, ProcessedMealMenu } from "@/providers/kdmhs/types";
import { formatDate } from "@/utils/date";
import { closeBrowser, fetchWithRetry } from "@/utils/fetch";

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
    for (let page = KDMHS_WEBSITE.PAGE_RANGE.START; page <= KDMHS_WEBSITE.PAGE_RANGE.END; page++) {
      const url = `${KDMHS_WEBSITE.BASE_URL}/${KDMHS_WEBSITE.LIST_PATH}`;

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
      `Fetched total ${allPosts.length} menu posts from pages ${KDMHS_WEBSITE.PAGE_RANGE.START}-${KDMHS_WEBSITE.PAGE_RANGE.END}`,
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

async function getMealData(db: MongoDBService, documentId: string, dateKey: string): Promise<CafeteriaData> {
  const mealLogger = logger.operation("parse-meal", dateKey);
  const timer = mealLogger.time();

  try {
    const url = `${KDMHS_WEBSITE.BASE_URL}/${KDMHS_WEBSITE.INFO_PATH}?mi=13609&bbsId=6909&nttSn=${documentId}`;

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
          line.startsWith(`*${MEAL_TYPES.BREAKFAST}:`) ||
          line.startsWith(`*${MEAL_TYPES.LUNCH}:`) ||
          line.startsWith(`*${MEAL_TYPES.DINNER}:`)
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

      if (line.startsWith(`*${MEAL_TYPES.BREAKFAST}:`)) {
        const { regular, simple, plus } = parseMealSection(contentLines, i, MEAL_TYPES.BREAKFAST);
        processedMenu.breakfast.regular = regular;
        processedMenu.breakfast.simple = simple;
        processedMenu.breakfast.plus = plus;
      } else if (line.startsWith(`*${MEAL_TYPES.LUNCH}:`)) {
        const { regular, simple, plus } = parseMealSection(contentLines, i, MEAL_TYPES.LUNCH);
        processedMenu.lunch.regular = regular;
        processedMenu.lunch.simple = simple;
        processedMenu.lunch.plus = plus;
      } else if (line.startsWith(`*${MEAL_TYPES.DINNER}:`)) {
        const { regular, simple, plus } = parseMealSection(contentLines, i, MEAL_TYPES.DINNER);
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
          const fullUrl = new URL(imgSrc, KDMHS_WEBSITE.BASE_URL).toString();
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
      const existingData = await db.getMealData<CafeteriaData>(dateKey);
      if (existingData) {
        mealLogger.info("All meals are empty, preserving existing data");
        timer("Preserved existing meal data (empty refresh result)");
        return existingData;
      }
    }

    await db.saveMealData(dateKey, result, { documentId });
    timer("Parsed and saved meal data");

    return result;
  } catch (error) {
    logger.error(`Failed to get meal data for ${dateKey}`, error);
    throw error;
  }
}

export async function getCafeteriaData(db: MongoDBService, dateParam: string): Promise<CafeteriaData> {
  const cachedData = await db.getMealData<CafeteriaData>(dateParam);
  if (cachedData) {
    return cachedData;
  }

  const collection = db.getCollection<MealDataDocument>();
  const [earliest] = await collection.find().sort({ _id: 1 }).limit(1).toArray();
  const [latest] = await collection.find().sort({ _id: -1 }).limit(1).toArray();

  if (!earliest || !latest) {
    throw new MealNotFoundError();
  }

  const targetDate = new Date(dateParam);
  const earliestDate = new Date(earliest._id);
  const latestDate = new Date(latest._id);

  if (targetDate < earliestDate || targetDate > latestDate) {
    throw new MealNotFoundError();
  }

  throw new MealNoOperationError();
}

export async function fetchAndSaveCafeteriaData(
  db: MongoDBService,
  dateParam: string,
  menuPosts: MenuPost[],
): Promise<CafeteriaData> {
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

  return await getMealData(db, targetPost.documentId, dateParam);
}

export async function refreshSpecificDate(db: MongoDBService, dateParam: string): Promise<CafeteriaData> {
  const collection = db.getCollection<MealDataDocument>();
  const document = await collection.findOne({ _id: dateParam }, { projection: { documentId: 1 } });
  const documentId = document?.documentId || null;

  if (!documentId) {
    throw new MealNotFoundError();
  }

  return await getMealData(db, documentId, dateParam);
}

export async function searchLatestFoodImage(db: MongoDBService, foodName: string): Promise<FoodSearchResult | null> {
  const collection = db.getCollection<MealDataDocument>();
  const regex = new RegExp(foodName, "i");

  const mealTypes = ["breakfast", "lunch", "dinner"] as const;

  for (const mealType of mealTypes) {
    const result = await collection.findOne(
      {
        $and: [
          {
            $or: [
              { [`data.${mealType}.regular`]: { $elemMatch: { $regex: regex } } },
              { [`data.${mealType}.simple`]: { $elemMatch: { $regex: regex } } },
            ],
          },
          { [`data.${mealType}.image`]: { $ne: "" } },
        ],
      },
      { sort: { _id: -1 } },
    );

    if (result) {
      return {
        image: result.data[mealType].image,
        date: result._id,
        mealType,
      };
    }
  }

  return null;
}

export async function runKdmhsRefresh(db: MongoDBService, refreshType: "today" | "all"): Promise<void> {
  const refreshLogger = logger.operation("kdmhs-refresh");
  const timer = refreshLogger.time();

  try {
    refreshLogger.info(`Starting KDMHS cafeteria data refresh (${refreshType})`);

    const menuPosts = await getLatestMenuPosts();
    let successCount = 0;
    let errorCount = 0;

    for (const post of menuPosts) {
      try {
        const postDate = new Date(post.date);
        if (Number.isNaN(postDate.getTime())) {
          refreshLogger.warn(`Invalid date: ${post.date} for ${post.title}`);
          continue;
        }

        if (refreshType === "today") {
          const today = new Date();
          const isToday =
            postDate.getDate() === today.getDate() &&
            postDate.getMonth() === today.getMonth() &&
            postDate.getFullYear() === today.getFullYear();

          if (!isToday) {
            continue;
          }
        }

        const dateKey = formatDate(postDate);
        refreshLogger.info(`Processing ${dateKey}`);
        await fetchAndSaveCafeteriaData(db, dateKey, menuPosts);
        refreshLogger.info(`✓ Completed ${dateKey}`);
        successCount++;
      } catch (error) {
        errorCount++;
        refreshLogger.error(`✗ Failed ${post.title}`, error);
      }
    }

    timer(`KDMHS refresh completed (${refreshType}): ${successCount} success, ${errorCount} errors`);
  } catch (error) {
    refreshLogger.error("KDMHS cafeteria refresh failed", error);
    throw error;
  } finally {
    await closeBrowser();
  }
}
