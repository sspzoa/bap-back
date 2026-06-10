import { MealNotFoundError } from "@/core/errors";
import { logger } from "@/core/logger";
import type { MongoDBService } from "@/core/mongodb";
import { DFLEX_WEBSITE } from "@/providers/dgu/config";
import { extractWeeklyMenu } from "@/providers/dgu/ocr";
import {
  type DflexArticle,
  enumerateWeekdays,
  fetchArticleImageUrl,
  fetchArticleList,
  fetchImage,
  findArticleForDate,
} from "@/providers/dgu/scrape";
import type { DguCafeteriaData, DguCategory } from "@/providers/dgu/types";
import { formatDate, getWeekDates } from "@/utils/date";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function emptyData(): DguCafeteriaData {
  return { restaurants: [] };
}

function buildCafeteriaData(categories: DguCategory[]): DguCafeteriaData {
  return {
    restaurants: [{ id: DFLEX_WEBSITE.RESTAURANT_ID, name: DFLEX_WEBSITE.RESTAURANT_NAME, categories }],
  };
}

function weekdayLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return WEEKDAY_LABELS[new Date(year, month - 1, day).getDay()];
}

/**
 * Fetch the article's menu image, OCR the whole week in one call, and persist
 * one document per operating day. Returns the per-date data that was saved.
 */
async function refreshWeekFromArticle(
  db: MongoDBService,
  article: DflexArticle,
): Promise<Map<string, DguCafeteriaData>> {
  const refreshLogger = logger.operation("dgu-refresh-week");
  const dates = enumerateWeekdays(article.weekStart, article.weekEnd);
  const result = new Map<string, DguCafeteriaData>();

  const imageUrl = await fetchArticleImageUrl(article.seq);
  if (!imageUrl) {
    refreshLogger.warn(`No menu image found for article ${article.seq} (${article.title})`);
    for (const date of dates) {
      const data = emptyData();
      await db.saveMealData(date, data);
      result.set(date, data);
    }
    return result;
  }

  const image = await fetchImage(imageUrl);
  const expectedDates = dates.map((date) => ({ date, weekday: weekdayLabel(date) }));
  const menuByDate = await extractWeeklyMenu(image, expectedDates);

  for (const date of dates) {
    const categories = menuByDate.get(date) ?? [];
    const data = buildCafeteriaData(categories);
    await db.saveMealData(date, data);
    result.set(date, data);
    refreshLogger.info(`Saved D-Flex ${date}: ${categories.length} categories`);
  }

  return result;
}

export async function getDguCafeteriaData(db: MongoDBService, dateParam: string): Promise<DguCafeteriaData> {
  const cachedData = await db.getMealData<DguCafeteriaData>(dateParam);
  if (cachedData) {
    return cachedData;
  }

  throw new MealNotFoundError();
}

export async function refreshDguCafeteriaData(db: MongoDBService, dateParam: string): Promise<DguCafeteriaData> {
  const articles = await fetchArticleList();
  const article = findArticleForDate(articles, dateParam);

  if (!article) {
    const data = emptyData();
    await db.saveMealData(dateParam, data);
    return data;
  }

  const weekData = await refreshWeekFromArticle(db, article);
  return weekData.get(dateParam) ?? emptyData();
}

export async function runDguRefresh(db: MongoDBService, refreshType: "today" | "all"): Promise<void> {
  const refreshLogger = logger.operation("dgu-refresh");
  const timer = refreshLogger.time();

  try {
    refreshLogger.info(`Starting D-Flex cafeteria data refresh (${refreshType})`);

    const today = formatDate(new Date());
    const targetDates =
      refreshType === "all"
        ? [...getWeekDates(today), ...getWeekDates(formatDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)))]
        : [today];

    const articles =
      refreshType === "all"
        ? [...(await fetchArticleList(1)), ...(await fetchArticleList(2))]
        : await fetchArticleList(1);

    const processed = new Set<number>();
    const toProcess: DflexArticle[] = [];
    for (const date of targetDates) {
      const article = findArticleForDate(articles, date);
      if (article && !processed.has(article.seq)) {
        processed.add(article.seq);
        toProcess.push(article);
      }
    }

    let successCount = 0;
    let errorCount = 0;

    for (const article of toProcess) {
      try {
        await refreshWeekFromArticle(db, article);
        refreshLogger.info(`✓ Completed D-Flex week ${article.weekStart} ~ ${article.weekEnd}`);
        successCount++;
      } catch (error) {
        errorCount++;
        refreshLogger.error(`✗ Failed D-Flex week ${article.weekStart} ~ ${article.weekEnd}`, error);
      }
    }

    timer(`D-Flex refresh completed (${refreshType}): ${successCount} success, ${errorCount} errors`);
  } catch (error) {
    refreshLogger.error("D-Flex cafeteria refresh failed", error);
    throw error;
  }
}
