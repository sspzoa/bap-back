import * as cheerio from "cheerio";
import { MealNotFoundError } from "@/middleware/error";
import { CONFIG } from "@/shared/lib/config";
import { logger } from "@/shared/lib/logger";
import { dguMongoDB } from "@/shared/lib/mongodb";
import type { DguCafeteriaData, DguCategory, DguMealInfo, DguMenuItem } from "@/shared/types";
import { dateToSday } from "@/shared/utils/date";
import { fetchWithRetry } from "@/shared/utils/fetch";

const ORIGIN_PATTERN = /\([^)]*[:：][^)]*산[^)]*\)/g;
const HOURS_PATTERN = /^\d{1,2}:\d{2}\s*[~～\-]/;
const HOURS_FULL_LINE = /^[\d:~～\-\s/()（）품절시까지]*$/;
const WON_CATEGORY_PRICE = /^[￦₩]\s*([\d,]+)$/;
const WON_SUFFIX_ONLY = /^([\d,]+)\s*원$/;
const INLINE_PRICE = /^(.+?)\s*([\d,]+)\s*원(.*)$/;
const ANNOTATION_TAG = /(?<!\*)\*[^*]+\*(?!\*)/g;

function isOriginOnly(text: string): boolean {
  return text.replace(ORIGIN_PATTERN, "").trim().length === 0;
}

function stripOrigin(text: string): string {
  return text.replace(ORIGIN_PATTERN, "").trim();
}

function isHoursLine(text: string): boolean {
  return HOURS_PATTERN.test(text) && HOURS_FULL_LINE.test(text);
}

function formatPrice(raw: string): string {
  const num = raw.replace(/,/g, "");
  const parsed = Number.parseInt(num, 10);
  if (Number.isNaN(parsed)) return raw;
  return parsed.toLocaleString("ko-KR");
}

function parseItemWithPrice(text: string): DguMenuItem {
  const match = text.match(INLINE_PRICE);
  if (match) {
    const name = match[1].trim();
    const price = formatPrice(match[2]);
    const suffix = match[3].trim();
    const fullName = suffix ? `${name}${suffix}` : name;
    if (fullName) {
      return { name: fullName, price };
    }
  }
  return { name: text, price: null };
}

function parseCellContent(cellHtml: string): DguMealInfo | null {
  if (!cellHtml.trim()) return null;

  const $ = cheerio.load(`<div>${cellHtml}</div>`);
  const root = $("div").first();

  root.find("span[style*='color:#cccccc']").remove();
  root.find("span[style*='color: #cccccc']").remove();

  const rawHtml = root.html() || "";

  const parts = rawHtml
    .split(/<br\s*\/?>|\n/gi)
    .map((part) => cheerio.load(part).text().trim())
    .filter(Boolean);

  let categoryPrice: string | null = null;
  const menuItems: DguMenuItem[] = [];
  const hours: string[] = [];

  for (const raw of parts) {
    const part = stripOrigin(raw);
    if (!part) continue;
    if (isOriginOnly(part)) continue;
    if (/^\*+$/.test(part)) continue;

    if (isHoursLine(part)) {
      hours.push(part);
      continue;
    }

    const catPriceMatch = part.match(WON_CATEGORY_PRICE);
    if (catPriceMatch) {
      categoryPrice = formatPrice(catPriceMatch[1]);
      continue;
    }

    const standalonePriceMatch = part.match(WON_SUFFIX_ONLY);
    if (standalonePriceMatch) {
      const price = formatPrice(standalonePriceMatch[1]);
      if (menuItems.length > 0 && menuItems[menuItems.length - 1].price === null) {
        menuItems[menuItems.length - 1].price = price;
      } else {
        categoryPrice = price;
      }
      continue;
    }

    const cleanedPart = part.replace(ANNOTATION_TAG, "").trim();
    if (!cleanedPart) continue;
    menuItems.push(parseItemWithPrice(cleanedPart));
  }

  if (menuItems.length === 0 && categoryPrice === null) return null;

  const operatingHours = hours.length > 0 ? hours.join(" / ") : null;

  return { items: menuItems, price: categoryPrice, operatingHours };
}

const CATEGORY_NAME_MAP: Record<string, string> = {
  메뉴1: "솥앤누들",
};

function refineCategoryName(category: DguCategory): DguCategory {
  let name = CATEGORY_NAME_MAP[category.name] || category.name;

  const slots = [category.lunch, category.dinner];

  for (const slot of slots) {
    if (!slot || slot.items.length === 0) continue;

    const first = slot.items[0];

    const decorativeMatch = first.name.match(/^\*{2,}(.+?)\*{2,}$/);
    if (decorativeMatch) {
      slot.items.shift();
      return { ...category, name: decorativeMatch[1].trim() };
    }

    const dashMatch = first.name.match(/^-(.+?)-$/);
    if (dashMatch) {
      slot.items.shift();
      return { ...category, name: `${name}(${dashMatch[1].trim()})` };
    }
  }

  return { ...category, name };
}

async function fetchRestaurantMenu(code: number, date: string): Promise<DguCategory[]> {
  const sday = dateToSday(date);
  const url = `${CONFIG.DGU.WEBSITE.BASE_URL}/menu.html?code=${code}&sday=${sday}`;

  const html = await fetchWithRetry<string>(url, {
    method: "GET",
    parser: async (response) => response.text(),
  });

  const $ = cheerio.load(html);
  const table = $("[data-role='content'] table").first();

  if (!table.length) {
    return [];
  }

  const rows = table.find("tr").toArray();
  if (rows.length < 2) return [];

  const headerCells = $(rows[0])
    .find("td, th")
    .map((_, el) => $(el).text().trim())
    .get();

  const isCombined = headerCells.some((h) => h.includes("중석식"));

  const categories: DguCategory[] = [];

  for (let i = 1; i < rows.length; i++) {
    const cells = $(rows[i]).find("td").toArray();
    if (cells.length === 0) continue;

    const categoryName = $(cells[0]).text().replace(/\s+/g, " ").trim();
    if (!categoryName) continue;

    if (isCombined) {
      const lunchHtml = cells[1] ? $(cells[1]).html() || "" : "";
      const lunch = parseCellContent(lunchHtml);
      const raw: DguCategory = { name: categoryName, lunch, dinner: null };
      categories.push(refineCategoryName(raw));
    } else {
      const lunchHtml = cells[1] ? $(cells[1]).html() || "" : "";
      const dinnerHtml = cells[2] ? $(cells[2]).html() || "" : "";
      const lunch = parseCellContent(lunchHtml);
      const dinner = parseCellContent(dinnerHtml);
      const raw: DguCategory = { name: categoryName, lunch, dinner };
      categories.push(refineCategoryName(raw));
    }
  }

  return categories;
}

async function fetchAllRestaurants(date: string): Promise<DguCafeteriaData> {
  const fetchLogger = logger.operation("dgu-fetch-all-restaurants");
  const timer = fetchLogger.time();

  const restaurants = await Promise.all(
    CONFIG.DGU.WEBSITE.RESTAURANTS.map(async (restaurant) => {
      try {
        const categories = await fetchRestaurantMenu(restaurant.code, date);
        fetchLogger.info(`Fetched ${restaurant.name}: ${categories.length} categories`);
        return {
          id: restaurant.id,
          name: restaurant.name,
          categories,
        };
      } catch (error) {
        fetchLogger.error(`Failed to fetch ${restaurant.name}`, error);
        return {
          id: restaurant.id,
          name: restaurant.name,
          categories: [],
        };
      }
    }),
  );

  timer(`Fetched all DGU restaurants for ${date}`);

  return { restaurants };
}

export async function getDguCafeteriaData(dateParam: string): Promise<DguCafeteriaData> {
  const cachedData = await dguMongoDB.getMealData(dateParam);
  if (cachedData) {
    return cachedData;
  }

  throw new MealNotFoundError();
}

export async function refreshDguCafeteriaData(dateParam: string): Promise<DguCafeteriaData> {
  const data = await fetchAllRestaurants(dateParam);
  await dguMongoDB.saveMealData(dateParam, data);
  return data;
}
