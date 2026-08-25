import { logger } from "@/core/logger";
import { getCachedMealDataOrThrow } from "@/core/mealLookup";
import type { MongoDBService } from "@/core/mongodb";
import type { CafeteriaData, FoodSearchResult, MealDataDocument } from "@/providers/kdmhs/types";
import { formatDate } from "@/utils/date";
import { isEmptyDay, parseWeekHtml } from "./parse";
import { fetchWeekHtml } from "./scrape";
import { findLatestFoodMatch } from "./search";
import type { CafeteriaWeekData } from "./types";

async function getWeekMealData(db: MongoDBService, dateKey: string): Promise<CafeteriaWeekData> {
  const mealLogger = logger.operation("parse-meal", dateKey);
  const timer = mealLogger.time();

  try {
    const html = await fetchWeekHtml(dateKey);
    const weekData = parseWeekHtml(html, dateKey);
    const dates = Object.keys(weekData);

    for (const date of dates) {
      const dayData = weekData[date];

      if (isEmptyDay(dayData)) {
        const existingData = await db.getMealData<CafeteriaData>(date);
        if (existingData) {
          mealLogger.info(`All meals are empty for ${date}, preserving existing data`);
          weekData[date] = existingData;
          continue;
        }
      }

      await db.saveMealData(date, dayData);
    }

    timer(`Parsed and saved weekly meal data (${dates.length} days)`);

    return weekData;
  } catch (error) {
    logger.error(`Failed to get meal data for ${dateKey}`, error);
    throw error;
  }
}

export async function getCafeteriaData(db: MongoDBService, dateParam: string): Promise<CafeteriaData> {
  return getCachedMealDataOrThrow<CafeteriaData>(db, dateParam);
}

export async function searchLatestFoodImage(db: MongoDBService, foodName: string): Promise<FoodSearchResult | null> {
  const collection = db.getCollection<MealDataDocument>();
  const today = formatDate(new Date());
  const documents = await collection
    .find({ _id: { $lt: today } })
    .sort({ _id: -1 })
    .toArray();
  return findLatestFoodMatch(documents, foodName, { excludeDate: today });
}

export async function runKdmhsRefresh(db: MongoDBService, refreshType: "today" | "all"): Promise<void> {
  const refreshLogger = logger.operation("kdmhs-refresh");
  const timer = refreshLogger.time();

  try {
    refreshLogger.info(`Starting KDMHS cafeteria data refresh (${refreshType})`);

    const today = new Date();
    const thisWeekStart = new Date(today);
    thisWeekStart.setDate(today.getDate() - today.getDay());

    const weekAnchors = [formatDate(thisWeekStart)];
    if (refreshType === "all") {
      const nextWeekStart = new Date(thisWeekStart);
      nextWeekStart.setDate(thisWeekStart.getDate() + 7);
      weekAnchors.push(formatDate(nextWeekStart));
    }

    let successCount = 0;
    let errorCount = 0;

    for (const weekAnchor of weekAnchors) {
      try {
        const weekData = await getWeekMealData(db, weekAnchor);
        refreshLogger.info(`✓ Parsed week ${weekAnchor} (${Object.keys(weekData).length} days)`);
        successCount++;
      } catch (error) {
        errorCount++;
        refreshLogger.error(`✗ Failed week ${weekAnchor}`, error);
      }
    }

    timer(`KDMHS refresh completed (${refreshType}): ${successCount} success, ${errorCount} errors`);
  } catch (error) {
    refreshLogger.error("KDMHS cafeteria refresh failed", error);
    throw error;
  }
}
