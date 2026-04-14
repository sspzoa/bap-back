import * as cheerio from "cheerio";
import { MealNoOperationError, MealNotFoundError } from "@/core/errors";
import { logger } from "@/core/logger";
import type { MongoDBService } from "@/core/mongodb";
import { KDMHS_WEBSITE, MEAL_TYPES } from "@/providers/kdmhs/config";
import type { CafeteriaData, FoodSearchResult, MealDataDocument, MenuPost, ProcessedMealMenu } from "@/providers/kdmhs/types";
import { formatDate } from "@/utils/date";
import { closeBrowser, fetchWithRetry } from "@/utils/fetch";
import { CafeteriaWeekData } from "./types";

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

function findMenuPostForDate(menuPosts: MenuPost[], dateParam: string): MenuPost | undefined {
  const targetDate = new Date(dateParam);
  const targetDateStr = formatDate(targetDate);

  return menuPosts.find((post) => {
    return post.date === targetDateStr;
  });
}

const parseMenu = (menuStr: string): string[] => {
  if (!menuStr) return [];

  const sanitizeMenuItem = (item: string): string => {
    return item
      .replaceAll(/\u00A0/g, " ")
      .replace(/\(\s*\d{1,2}(?:\.\d{1,2})*\s*\)/g, "")
      .replace(/(?<=\D)\d{1,2}(?:\.\d{1,2})*(?=(?:or|OR|$|\s|[,&/]))/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  };

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

  return items.map(sanitizeMenuItem).filter(Boolean);
};

async function getWeekMealData(db: MongoDBService, dateKey: string): Promise<CafeteriaWeekData> {
  const mealLogger = logger.operation("parse-meal", dateKey);
  const timer = mealLogger.time();

  try {
    const url = `${KDMHS_WEBSITE.BASE_URL}/${KDMHS_WEBSITE.TABLE_PATH}?mi=13655`;

    const html = await fetchWithRetry<string>(url, {
      method: "POST",
      body: {
        "schDt": dateKey
      },
      parser: async (response) => response.text(),
    });

    const $ = cheerio.load(html);

    const createEmptyMeal = () => ({ regular: [], simple: [], plus: [], image: "", kcal: 0 });
    const createEmptyDay = (): CafeteriaData => ({
      breakfast: createEmptyMeal(),
      lunch: createEmptyMeal(),
      dinner: createEmptyMeal(),
    });

    const hasMeaningfulCellContent = (cell: cheerio.Cheerio<cheerio.Element>): boolean => {
      const detailParagraph = cell
        .find("p")
        .filter((_, p) => {
          const pEl = $(p);
          const cls = pEl.attr("class") || "";
          if (cls === "fm_img" || cls.includes("fm_tit_p")) {
            return false;
          }

          const htmlText = pEl.html() || "";
          const plainText = pEl.text().trim();
          if (plainText.includes("상세보기")) {
            return false;
          }

          return htmlText.includes("<br") || plainText.length > 0;
        })
        .last();

      return detailParagraph.length > 0 && detailParagraph.text().trim().length > 0;
    };

    const mealRows = $("tbody tr")
      .toArray()
      .map((row) => $(row))
      .filter((rowEl) => {
        const label = rowEl.find("th").first().text().trim();
        return label === MEAL_TYPES.BREAKFAST || label === MEAL_TYPES.LUNCH || label === MEAL_TYPES.DINNER;
      });

    const resolveDateColumns = (): Array<{ cellIndex: number; date: string }> => {
      const headerCells = $("thead tr")
        .last()
        .find("th, td")
        .toArray();

      const columns = headerCells
        .map((cell, headerIndex) => {
          const text = $(cell).text().replace(/\s+/g, " ").trim();
          const dateMatch = text.match(/\d{4}-\d{2}-\d{2}/);
          if (!dateMatch) {
            return null;
          }

          const cellIndex = headerIndex - 1;
          if (cellIndex < 0) {
            return null;
          }

          return { cellIndex, date: dateMatch[0] };
        })
        .filter((value): value is { cellIndex: number; date: string } => value !== null);

      if (columns.length > 0) {
        return columns;
      }

      const anchor = new Date(dateKey);
      const day = anchor.getDay();
      const sundayOffset = -day;
      const sunday = new Date(anchor);
      sunday.setDate(anchor.getDate() + sundayOffset);

      return Array.from({ length: 7 }, (_, idx) => {
        const d = new Date(sunday);
        d.setDate(sunday.getDate() + idx);
        return { cellIndex: idx, date: formatDate(d) };
      });
    };

    const dateColumns = resolveDateColumns();

    const parseMealCell = (cell: cheerio.Cheerio<cheerio.Element>) => {
      const regular: string[] = [];
      const simple: string[] = [];
      const plus: string[] = [];

      const kcalText = cell.find(".fm_tit_p").first().text().trim();
      const kcalMatch = kcalText.match(/([\d.]+)/);
      const kcal = kcalMatch ? Number.parseFloat(kcalMatch[1]) : 0;

      let image = "";
      const imgSrc = cell.find(".fm_img img").first().attr("src");
      if (imgSrc && !imgSrc.includes("/images/ad/fm/meal_icon.png")) {
        try {
          image = new URL(imgSrc, KDMHS_WEBSITE.BASE_URL).toString();
        } catch {
          mealLogger.warn(`Failed to parse image URL: ${imgSrc}`);
        }
      }

      const detailParagraph =
        cell
          .find("p")
          .filter((_, p) => {
            const pEl = $(p);
            const cls = pEl.attr("class") || "";
            if (cls === "fm_img" || cls.includes("fm_tit_p")) {
              return false;
            }

            const htmlText = pEl.html() || "";
            const plainText = pEl.text().trim();
            if (plainText.includes("상세보기")) {
              return false;
            }

            return htmlText.includes("<br") || plainText.length > 0;
          })
          .last() || null;

      if (!detailParagraph) {
        return { regular, simple, plus, image, kcal };
      }

      const detailHtml = detailParagraph.html() || "";
      const lines = detailHtml
        .split(/<br\s*\/?>/i)
        .map((part) => cheerio.load(part).text().replaceAll(/\u00A0/g, " ").trim())
        .filter(Boolean);

      let section: "regular" | "plus" | "simple" = "regular";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
          continue;
        }

        if (line.includes("<셀프바>") || line.includes("<플러스바>")) {
          section = "plus";
          const marker = line.includes("<셀프바>") ? "<셀프바>" : "<플러스바>";
          const tail = line.split(marker)[1]?.trim();
          if (tail) {
            plus.push(...parseMenu(tail));
          }
          continue;
        }

        if (line.includes("<간편식>")) {
          section = "simple";
          const tail = line.split("<간편식>")[1]?.trim();
          if (tail) {
            simple.push(...parseMenu(tail));
          }
          continue;
        }

        if (section === "regular") {
          regular.push(...parseMenu(line));
        } else if (section === "plus") {
          plus.push(...parseMenu(line));
        } else {
          simple.push(...parseMenu(line));
        }
      }

      return { regular, simple, plus, image, kcal };
    };

    const mealTypeMap: Record<string, keyof ProcessedMealMenu> = {
      [MEAL_TYPES.BREAKFAST]: "breakfast",
      [MEAL_TYPES.LUNCH]: "lunch",
      [MEAL_TYPES.DINNER]: "dinner",
    };

    const weekData: CafeteriaWeekData = {};
    for (const { date } of dateColumns) {
      if (!weekData[date]) {
        weekData[date] = createEmptyDay();
      }
    }

    $("tbody tr").each((_, row) => {
      const rowEl = $(row);
      const mealTypeText = rowEl.find("th").first().text().trim();
      const mealKey = mealTypeMap[mealTypeText];
      if (!mealKey) {
        return;
      }

      const cells = rowEl.find("td").toArray();
      for (const { cellIndex, date } of dateColumns) {
        const targetCell = cells[cellIndex];
        if (!targetCell) {
          continue;
        }

        if (!hasMeaningfulCellContent($(targetCell))) {
          continue;
        }

        const parsed = parseMealCell($(targetCell));
        if (!weekData[date]) {
          weekData[date] = createEmptyDay();
        }

        weekData[date][mealKey] = {
          regular: parsed.regular,
          simple: parsed.simple,
          plus: parsed.plus,
          image: parsed.image,
          kcal: parsed.kcal,
        };
      }
    });

    const isEmptyDay = (dayData: CafeteriaData): boolean => {
      return (
        dayData.breakfast.regular.length === 0 &&
        dayData.breakfast.simple.length === 0 &&
        dayData.breakfast.plus.length === 0 &&
        dayData.lunch.regular.length === 0 &&
        dayData.lunch.simple.length === 0 &&
        dayData.lunch.plus.length === 0 &&
        dayData.dinner.regular.length === 0 &&
        dayData.dinner.simple.length === 0 &&
        dayData.dinner.plus.length === 0
      );
    };

    for (const { date } of dateColumns) {
      const dayData = weekData[date] || createEmptyDay();

      if (isEmptyDay(dayData)) {
        const existingData = await db.getMealData<CafeteriaData>(date);
        if (existingData) {
          mealLogger.info(`All meals are empty for ${date}, preserving existing data`);
          weekData[date] = existingData;
          continue;
        }
      }

      await db.saveMealData(date, dayData);
      weekData[date] = dayData;
    }

    timer(`Parsed and saved weekly meal data (${dateColumns.length} days)`);

    return weekData;
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
  } finally {
    await closeBrowser();
  }
}
