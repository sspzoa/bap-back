import * as cheerio from "cheerio";
import { DFLEX_WEBSITE } from "@/providers/dgu/config";
import { formatDate, getWeekDates, parseLocalDate } from "@/utils/date";
import { fetchWithRetry } from "@/utils/fetch";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

const WEEK_RANGE = /\[(\d{4})\.(\d{2})\.(\d{2})\.\s*~\s*(\d{4})\.(\d{2})\.(\d{2})\.\]/;

export interface DflexArticle {
  seq: number;
  title: string;
  /** YYYY-MM-DD, first operating day of the week */
  weekStart: string;
  /** YYYY-MM-DD, last operating day of the week */
  weekEnd: string;
}

function parseWeekRange(title: string): { weekStart: string; weekEnd: string } | null {
  const match = title.match(WEEK_RANGE);
  if (!match) return null;
  return {
    weekStart: `${match[1]}-${match[2]}-${match[3]}`,
    weekEnd: `${match[4]}-${match[5]}-${match[6]}`,
  };
}

async function fetchHtml(url: string): Promise<string> {
  return fetchWithRetry<string>(url, {
    method: "GET",
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    parser: async (response) => response.text(),
  });
}

/** Fetch one page of the FOODDFLEX board and parse the weekly-menu articles. */
export async function fetchArticleList(pageIndex = 1): Promise<DflexArticle[]> {
  const url = `${DFLEX_WEBSITE.BASE_URL}${DFLEX_WEBSITE.LIST_PATH}?pageIndex=${pageIndex}`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const articles: DflexArticle[] = [];
  $(".board_list li a").each((_, el) => {
    const onclick = $(el).attr("onclick") || "";
    const seqMatch = onclick.match(/goDetail\((\d+)\)/);
    if (!seqMatch) return;

    const title = $(el).find(".tit").text().replace(/\s+/g, " ").trim();
    const range = parseWeekRange(title);
    if (!range) return;

    articles.push({ seq: Number.parseInt(seqMatch[1], 10), title, weekStart: range.weekStart, weekEnd: range.weekEnd });
  });

  return articles;
}

/** Find the article whose operating week (Mon–Sun) contains the given date. */
export function findArticleForDate(articles: DflexArticle[], date: string): DflexArticle | null {
  const monday = getWeekDates(date)[0];
  return articles.find((article) => getWeekDates(article.weekStart)[0] === monday) ?? null;
}

/** Extract the embedded weekly-menu image URL from an article's detail page. */
export async function fetchArticleImageUrl(seq: number): Promise<string | null> {
  const url = `${DFLEX_WEBSITE.BASE_URL}${DFLEX_WEBSITE.DETAIL_PATH}/${seq}`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const src = $(".view_cont img").first().attr("src");
  if (!src) return null;

  return src.startsWith("http") ? src : `${DFLEX_WEBSITE.BASE_URL}${src}`;
}

export type MenuImageMediaType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

export interface MenuImage {
  data: string;
  mediaType: MenuImageMediaType;
}

function detectMediaType(bytes: Uint8Array): MenuImageMediaType {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57 && bytes[9] === 0x45) return "image/webp";
  return "image/png";
}

/** Download the menu image as base64 plus its detected media type for vision OCR. */
export async function fetchImage(url: string): Promise<MenuImage> {
  const buffer = await fetchWithRetry<ArrayBuffer>(url, {
    method: "GET",
    headers: { "User-Agent": USER_AGENT },
    parser: async (response) => response.arrayBuffer(),
  });
  const bytes = new Uint8Array(buffer);
  return { data: Buffer.from(buffer).toString("base64"), mediaType: detectMediaType(bytes) };
}

/** Inclusive list of YYYY-MM-DD dates from weekStart to weekEnd (the operating days). */
export function enumerateWeekdays(weekStart: string, weekEnd: string): string[] {
  const dates: string[] = [];
  const cursor = parseLocalDate(weekStart);
  const end = parseLocalDate(weekEnd);

  while (cursor.getTime() <= end.getTime()) {
    dates.push(formatDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}
