import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { logger } from "@/core/logger";
import { KDMHS_WEBSITE, MEAL_TYPES } from "@/providers/kdmhs/config";
import type { CafeteriaData, CafeteriaWeekData, ProcessedMeal } from "@/providers/kdmhs/types";
import { formatDate, parseLocalDate } from "@/utils/date";

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

const createEmptyMeal = (): ProcessedMeal => ({ regular: [], simple: [], plus: [], image: "", kcal: 0 });

export const createEmptyDay = (): CafeteriaData => ({
  breakfast: createEmptyMeal(),
  lunch: createEmptyMeal(),
  dinner: createEmptyMeal(),
});

export function isEmptyDay(dayData: CafeteriaData): boolean {
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
}

function isDetailParagraph($: cheerio.CheerioAPI, p: AnyNode): boolean {
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
}

function hasMeaningfulCellContent($: cheerio.CheerioAPI, cell: cheerio.Cheerio<AnyNode>): boolean {
  const detailParagraph = cell.find("p").filter((_, p) => isDetailParagraph($, p)).last();
  return detailParagraph.length > 0 && detailParagraph.text().trim().length > 0;
}

function resolveDateColumns(
  $: cheerio.CheerioAPI,
  dateKey: string,
): Array<{ cellIndex: number; date: string }> {
  const headerCells = $("thead tr").last().find("th, td").toArray();

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

  const anchor = parseLocalDate(dateKey);
  const day = anchor.getDay();
  const sundayOffset = -day;
  const sunday = new Date(anchor);
  sunday.setDate(anchor.getDate() + sundayOffset);

  return Array.from({ length: 7 }, (_, idx) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + idx);
    return { cellIndex: idx, date: formatDate(d) };
  });
}

function parseMealCell($: cheerio.CheerioAPI, cell: cheerio.Cheerio<AnyNode>): ProcessedMeal {
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
      logger.warn(`Failed to parse image URL: ${imgSrc}`);
    }
  }

  const detailParagraph = cell.find("p").filter((_, p) => isDetailParagraph($, p)).last();

  if (detailParagraph.length === 0) {
    return { regular, simple, plus, image, kcal };
  }

  const detailHtml = detailParagraph.html() || "";
  const lines = detailHtml
    .split(/<br\s*\/?>/i)
    .map((part) =>
      cheerio
        .load(part)
        .text()
        .replaceAll(/\u00A0/g, " ")
        .trim(),
    )
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
}

export function parseWeekHtml(html: string, dateKey: string): CafeteriaWeekData {
  const $ = cheerio.load(html);

  const mealRows = $("tbody tr")
    .toArray()
    .map((row) => $(row))
    .filter((rowEl) => {
      const label = rowEl.find("th").first().text().trim();
      return label === MEAL_TYPES.BREAKFAST || label === MEAL_TYPES.LUNCH || label === MEAL_TYPES.DINNER;
    });

  const dateColumns = resolveDateColumns($, dateKey);

  const mealTypeMap: Record<string, keyof CafeteriaData> = {
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

  for (const rowEl of mealRows) {
    const mealTypeText = rowEl.find("th").first().text().trim();
    const mealKey = mealTypeMap[mealTypeText];
    if (!mealKey) {
      continue;
    }

    const cells = rowEl.find("td").toArray();
    for (const { cellIndex, date } of dateColumns) {
      const targetCell = cells[cellIndex];
      if (!targetCell) {
        continue;
      }

      if (!hasMeaningfulCellContent($, $(targetCell))) {
        continue;
      }

      const parsed = parseMealCell($, $(targetCell));
      if (!weekData[date]) {
        weekData[date] = createEmptyDay();
      }

      weekData[date][mealKey] = parsed;
    }
  }

  return weekData;
}
