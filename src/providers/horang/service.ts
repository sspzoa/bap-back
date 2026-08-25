import { logger } from "@/core/logger";
import { getCachedMealDataOrThrow } from "@/core/mealLookup";
import type { MongoDBService } from "@/core/mongodb";
import { extractWeeklyMenu } from "@/providers/horang/ocr";
import {
  enumerateWeekdays,
  fetchArticleImageUrl,
  fetchArticleList,
  fetchImage,
  findArticleForDate,
  type HorangArticle,
} from "@/providers/horang/scrape";
import type { HorangMenu } from "@/providers/horang/types";
import { formatDate, getWeekDates } from "@/utils/date";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function emptyMenu(): HorangMenu {
  return { meals: [] };
}

function weekdayLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return WEEKDAY_LABELS[new Date(year, month - 1, day).getDay()];
}

/**
 * Fetch the post's menu image, OCR the whole week in one call, and persist
 * one document per operating day. Returns the per-date menu that was saved.
 */
async function refreshWeekFromArticle(db: MongoDBService, article: HorangArticle): Promise<Map<string, HorangMenu>> {
  const refreshLogger = logger.operation("horang-refresh-week");
  const dates = enumerateWeekdays(article.weekStart, article.weekEnd);
  const result = new Map<string, HorangMenu>();

  const imageUrl = await fetchArticleImageUrl(article.logNo);
  if (!imageUrl) {
    refreshLogger.warn(`No menu image found for post ${article.logNo} (${article.title})`);
    for (const date of dates) {
      const data = emptyMenu();
      await db.saveMealData(date, data);
      result.set(date, data);
    }
    return result;
  }

  const image = await fetchImage(imageUrl);
  const expectedDates = dates.map((date) => ({ date, weekday: weekdayLabel(date) }));
  const mealsByDate = await extractWeeklyMenu(image, expectedDates);

  for (const date of dates) {
    const data: HorangMenu = { meals: mealsByDate.get(date) ?? [] };
    await db.saveMealData(date, data);
    result.set(date, data);
    refreshLogger.info(`Saved Horang Edu ${date}: ${data.meals.length} meals`);
  }

  return result;
}

export async function getHorangMenu(db: MongoDBService, dateParam: string): Promise<HorangMenu> {
  return getCachedMealDataOrThrow<HorangMenu>(db, dateParam);
}

export async function runHorangRefresh(db: MongoDBService, refreshType: "today" | "all"): Promise<void> {
  const refreshLogger = logger.operation("horang-refresh");
  const timer = refreshLogger.time();

  try {
    refreshLogger.info(`Starting Horang Edu cafeteria data refresh (${refreshType})`);

    const today = formatDate(new Date());
    const targetDates =
      refreshType === "all"
        ? [...getWeekDates(today), ...getWeekDates(formatDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)))]
        : [today];

    const articles = await fetchArticleList(1);

    const processed = new Set<string>();
    const toProcess: HorangArticle[] = [];
    for (const date of targetDates) {
      const article = findArticleForDate(articles, date);
      if (article && !processed.has(article.logNo)) {
        processed.add(article.logNo);
        toProcess.push(article);
      }
    }

    let successCount = 0;
    let errorCount = 0;

    for (const article of toProcess) {
      try {
        await refreshWeekFromArticle(db, article);
        refreshLogger.info(`✓ Completed Horang Edu week ${article.weekStart} ~ ${article.weekEnd}`);
        successCount++;
      } catch (error) {
        errorCount++;
        refreshLogger.error(`✗ Failed Horang Edu week ${article.weekStart} ~ ${article.weekEnd}`, error);
      }
    }

    timer(`Horang Edu refresh completed (${refreshType}): ${successCount} success, ${errorCount} errors`);
  } catch (error) {
    refreshLogger.error("Horang Edu cafeteria refresh failed", error);
    throw error;
  }
}
