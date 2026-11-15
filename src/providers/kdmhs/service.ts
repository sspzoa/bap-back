import { logger } from "@/core/logger";
import { getCachedMealDataOrThrow } from "@/core/mealLookup";
import type { MongoDBService } from "@/core/mongodb";
import type { CafeteriaData, FoodSearchResult, MealDataDocument } from "@/providers/kdmhs/types";
import { formatDate, parseLocalDate } from "@/utils/date";
import { isEmptyDay, parseWeekHtml } from "./parse";
import { fetchWeekHtml } from "./scrape";
import { findLatestFoodMatch } from "./search";
import type { CafeteriaWeekData } from "./types";

const MEAL_TYPES = ["breakfast", "lunch", "dinner"] as const;

/**
 * Sunday of the week that contains 2026-10-28, the first day classified by the
 * retired menu model. The school week runs Sunday–Saturday.
 */
export const RULE_PARSER_BACKFILL_FROM = "2026-10-25";
const RULE_PARSER_BACKFILL_JOB = "kdmhs-rule-parser-since-2026-10-28";

interface KdmhsJob {
  _id: string;
  completedAt: Date;
}

function startOfWeek(date: Date): Date {
  const start = new Date(date);
  start.setDate(date.getDate() - date.getDay());
  start.setHours(0, 0, 0, 0);
  return start;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(date.getDate() + days);
  return next;
}

/** Previous, current, and next school weeks. The one-time backfill also walks forward from 2026-10-25. */
export function kdmhsAllWeekAnchors(today: Date, backfillPending: boolean): string[] {
  const thisWeek = startOfWeek(today);
  const nextWeek = addDays(thisWeek, 7);
  const anchors = new Set<string>([formatDate(addDays(thisWeek, -7)), formatDate(thisWeek), formatDate(nextWeek)]);

  if (backfillPending) {
    for (
      let cursor = parseLocalDate(RULE_PARSER_BACKFILL_FROM);
      cursor.getTime() <= nextWeek.getTime();
      cursor = addDays(cursor, 7)
    ) {
      anchors.add(formatDate(cursor));
    }
  }

  return [...anchors].sort();
}

function keepStoredMedia(parsed: CafeteriaData, existing: CafeteriaData | null): CafeteriaData {
  if (!existing) return parsed;

  const next = { ...parsed };
  for (const mealType of MEAL_TYPES) {
    const meal = { ...parsed[mealType] };
    if (!meal.image && existing[mealType].image) meal.image = existing[mealType].image;
    if (!meal.kcal && existing[mealType].kcal) meal.kcal = existing[mealType].kcal;
    next[mealType] = meal;
  }
  return next;
}

async function isBackfillDone(db: MongoDBService): Promise<boolean> {
  const job = await db.getDb().collection<KdmhsJob>("kdmhs_jobs").findOne({ _id: RULE_PARSER_BACKFILL_JOB });
  return job !== null;
}

async function markBackfillDone(db: MongoDBService): Promise<void> {
  await db
    .getDb()
    .collection<KdmhsJob>("kdmhs_jobs")
    .updateOne({ _id: RULE_PARSER_BACKFILL_JOB }, { $setOnInsert: { completedAt: new Date() } }, { upsert: true });
}

/** Photo refresh: update today's image and kcal from the HTML, keeping stored menus. */
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

  const day = parseWeekHtml(await fetchHtml(date), date)[date];
  if (!day) {
    logger.warn(`KDMHS photo refresh skipped for ${date}: date missing from the school page`);
    return;
  }

  let changed = false;
  for (const mealType of MEAL_TYPES) {
    const { image, kcal } = day[mealType];
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

export async function getWeekMealData(
  db: MongoDBService,
  dateKey: string,
  fetchHtml: typeof fetchWeekHtml = fetchWeekHtml,
): Promise<CafeteriaWeekData> {
  const mealLogger = logger.operation("parse-meal", dateKey);
  const timer = mealLogger.time();

  try {
    const html = await fetchHtml(dateKey);
    const weekData = parseWeekHtml(html, dateKey);
    const dates = Object.keys(weekData);

    for (const date of dates) {
      let dayData = weekData[date];

      if (isEmptyDay(dayData)) {
        const existingData = await db.getMealData<CafeteriaData>(date);
        if (existingData) {
          mealLogger.info(`All meals are empty for ${date}, preserving existing data`);
          weekData[date] = existingData;
          continue;
        }
      } else {
        dayData = keepStoredMedia(dayData, await db.getMealData<CafeteriaData>(date));
        weekData[date] = dayData;
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

export async function runKdmhsRefresh(
  db: MongoDBService,
  refreshType: "today" | "all",
  options?: { now?: Date; fetchHtml?: typeof fetchWeekHtml },
): Promise<void> {
  const refreshLogger = logger.operation("kdmhs-refresh");
  const timer = refreshLogger.time();
  const fetchHtml = options?.fetchHtml ?? fetchWeekHtml;

  try {
    refreshLogger.info(`Starting KDMHS cafeteria data refresh (${refreshType})`);

    const today = options?.now ?? new Date();
    // "today" slots only pick up meal photos for the current day; menus refresh on "all".
    if (refreshType === "today") {
      await refreshTodayImages(db, formatDate(today), fetchHtml);
      timer("KDMHS photo refresh completed");
      return;
    }

    const backfillPending = !(await isBackfillDone(db));
    const weekAnchors = kdmhsAllWeekAnchors(today, backfillPending);
    refreshLogger.info(
      `KDMHS weeks ${weekAnchors.join(", ")}${backfillPending ? " (includes rule-parser backfill)" : ""}`,
    );

    let successCount = 0;
    let errorCount = 0;

    for (const weekAnchor of weekAnchors) {
      try {
        const weekData = await getWeekMealData(db, weekAnchor, fetchHtml);
        refreshLogger.info(`✓ Parsed week ${weekAnchor} (${Object.keys(weekData).length} days)`);
        successCount++;
      } catch (error) {
        errorCount++;
        refreshLogger.error(`✗ Failed week ${weekAnchor}`, error);
      }
    }

    if (backfillPending && errorCount === 0) {
      await markBackfillDone(db);
      refreshLogger.info("KDMHS rule-parser backfill completed");
    }

    timer(`KDMHS refresh completed (${refreshType}): ${successCount} success, ${errorCount} errors`);
  } catch (error) {
    refreshLogger.error("KDMHS cafeteria refresh failed", error);
    throw error;
  }
}
