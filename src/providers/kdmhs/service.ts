import { logger } from "@/core/logger";
import { getCachedMealDataOrThrow } from "@/core/mealLookup";
import type { MongoDBService } from "@/core/mongodb";
import { extractWeeklyMenu } from "@/providers/kdmhs/ai";
import type { CafeteriaData, FoodSearchResult, MealDataDocument } from "@/providers/kdmhs/types";
import { formatDate } from "@/utils/date";
import { extractWeekSource, isEmptyDay, parseWeekHtml } from "./parse";
import { fetchWeekHtml } from "./scrape";
import { findLatestFoodMatch } from "./search";
import type { CafeteriaWeekData, MealSource } from "./types";

/**
 * Extract the week, sending only meals whose raw text differs from the stored `source` to the AI.
 * Unchanged meals keep their stored menus; if the AI call or validation fails, changed meals use
 * the rule-based parser and are retried on the next refresh.
 */
export async function extractWeekData(
  db: MongoDBService,
  html: string,
  dateKey: string,
  extract: typeof extractWeeklyMenu = extractWeeklyMenu,
): Promise<CafeteriaWeekData> {
  const source = extractWeekSource(html, dateKey);
  const stored: Record<string, CafeteriaData | null> = Object.fromEntries(
    await Promise.all(source.dates.map(async (date) => [date, await db.getMealData<CafeteriaData>(date)] as const)),
  );
  const isUnchanged = (meal: MealSource) => stored[meal.date]?.[meal.mealType]?.source === meal.text;
  const changed = source.meals.filter((meal) => !isUnchanged(meal));
  logger.info(`KDMHS ${dateKey}: ${changed.length}/${source.meals.length} meals changed`);

  let week: CafeteriaWeekData;
  try {
    week = await extract({ dates: source.dates, meals: changed });
    for (const meal of changed) {
      week[meal.date][meal.mealType].source = meal.text;
    }
  } catch (error) {
    logger.error(`KDMHS AI extraction failed for ${dateKey}; falling back to HTML parser`, error);
    week = parseWeekHtml(html, dateKey);
  }

  for (const meal of source.meals.filter(isUnchanged)) {
    week[meal.date][meal.mealType] = {
      ...(stored[meal.date] as CafeteriaData)[meal.mealType],
      image: meal.image,
      kcal: meal.kcal,
    };
  }
  return week;
}

/** Photo refresh: update today's image and kcal from the HTML without the AI, keeping stored menus. */
export async function refreshTodayImages(
  db: MongoDBService,
  date: string,
  fetchHtml: typeof fetchWeekHtml = fetchWeekHtml,
): Promise<void> {
  const stored = await db.getMealData<CafeteriaData>(date);
  if (!stored) {
    logger.warn(`KDMHS photo refresh skipped for ${date}: no stored menu yet`);
    return;
  }

  const meals = extractWeekSource(await fetchHtml(date), date).meals.filter((meal) => meal.date === date);
  let changed = false;
  for (const { mealType, image, kcal } of meals) {
    // Never replace a known photo or kcal with an empty value from a partial page.
    if (image && stored[mealType].image !== image) {
      stored[mealType].image = image;
      changed = true;
    }
    if (kcal && stored[mealType].kcal !== kcal) {
      stored[mealType].kcal = kcal;
      changed = true;
    }
  }

  if (changed) {
    await db.saveMealData(date, stored);
  }
  logger.info(`KDMHS photo refresh for ${date}: ${changed ? "updated" : "no changes"}`);
}

export async function getWeekMealData(db: MongoDBService, dateKey: string): Promise<CafeteriaWeekData> {
  const mealLogger = logger.operation("parse-meal", dateKey);
  const timer = mealLogger.time();

  try {
    const html = await fetchWeekHtml(dateKey);
    const weekData = await extractWeekData(db, html, dateKey);
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
    // "today" slots only pick up meal photos for the current day; menus refresh on "all".
    if (refreshType === "today") {
      await refreshTodayImages(db, formatDate(today));
      timer("KDMHS photo refresh completed");
      return;
    }

    const thisWeekStart = new Date(today);
    thisWeekStart.setDate(today.getDate() - today.getDay());
    const nextWeekStart = new Date(thisWeekStart);
    nextWeekStart.setDate(thisWeekStart.getDate() + 7);
    const weekAnchors = [formatDate(thisWeekStart), formatDate(nextWeekStart)];

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
