import * as cheerio from "cheerio";
import { HORANG_BLOG } from "@/providers/horang/config";
import { formatDate, parseLocalDate } from "@/utils/date";
import { fetchWithRetry } from "@/utils/fetch";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

const NAVER_HEADERS = {
  "User-Agent": USER_AGENT,
  Referer: "https://blog.naver.com/",
} as const;

/** 2026.08.24~08.28 / 2026.07.13~07.17 / 2025.3.3-3.7 */
const WEEK_RANGE = /(\d{4})\.(\d{1,2})\.(\d{1,2})\s*[~～-]\s*(\d{1,2})\.(\d{1,2})/;

export interface HorangArticle {
  logNo: string;
  title: string;
  /** YYYY-MM-DD, first operating day of the week */
  weekStart: string;
  /** YYYY-MM-DD, last operating day of the week */
  weekEnd: string;
}

interface PostTitleListResponse {
  postList?: { logNo: string; title: string }[];
}

function pad2(value: string): string {
  return value.padStart(2, "0");
}

export function decodePostTitle(encoded: string): string {
  return decodeURIComponent(encoded.replace(/\+/g, " "));
}

export function parseWeekRange(title: string): { weekStart: string; weekEnd: string } | null {
  if (!title.includes("주간메뉴표")) return null;

  const match = title.match(WEEK_RANGE);
  if (!match) return null;

  const startYear = Number.parseInt(match[1], 10);
  const startMonth = Number.parseInt(match[2], 10);
  const endMonth = Number.parseInt(match[4], 10);
  const endYear = endMonth < startMonth ? startYear + 1 : startYear;

  return {
    weekStart: `${startYear}-${pad2(match[2])}-${pad2(match[3])}`,
    weekEnd: `${endYear}-${pad2(match[4])}-${pad2(match[5])}`,
  };
}

/** Naver thumbnails 404 without a size suffix; blogfiles hosts the original. */
export function toOriginalImageUrl(src: string): string {
  const withoutQuery = src.split("?")[0];
  return withoutQuery
    .replace("://mblogthumb-phinf.pstatic.net/", "://blogfiles.pstatic.net/")
    .replace("://blogthumb.pstatic.net/", "://blogfiles.pstatic.net/");
}

async function fetchText(url: string, accept: string): Promise<string> {
  return fetchWithRetry<string>(url, {
    method: "GET",
    headers: { ...NAVER_HEADERS, Accept: accept },
    parser: async (response) => response.text(),
  });
}

function parsePostListJson(text: string): PostTitleListResponse {
  const sanitized = text.replace(/\\'/g, "'");
  return JSON.parse(sanitized) as PostTitleListResponse;
}

/** Fetch one page of the 호랑에듀 구내식당 메뉴표 category and keep weekly-menu posts. */
export async function fetchArticleList(page = 1): Promise<HorangArticle[]> {
  const params = new URLSearchParams({
    blogId: HORANG_BLOG.BLOG_ID,
    viewdate: "",
    currentPage: String(page),
    categoryNo: String(HORANG_BLOG.CATEGORY_NO),
    parentCategoryNo: "",
    countPerPage: "10",
  });
  const html = await fetchText(`${HORANG_BLOG.LIST_URL}?${params.toString()}`, "application/json");
  const payload = parsePostListJson(html);

  const articles: HorangArticle[] = [];
  for (const post of payload.postList ?? []) {
    const title = decodePostTitle(post.title);
    const range = parseWeekRange(title);
    if (!range) continue;
    articles.push({ logNo: post.logNo, title, weekStart: range.weekStart, weekEnd: range.weekEnd });
  }

  return articles;
}

/** Find the article whose operating week contains the given date. */
export function findArticleForDate(articles: HorangArticle[], date: string): HorangArticle | null {
  return articles.find((article) => article.weekStart <= date && date <= article.weekEnd) ?? null;
}

/** Extract the weekly-menu image URL from a blog post. */
export async function fetchArticleImageUrl(logNo: string): Promise<string | null> {
  const url = `${HORANG_BLOG.POST_VIEW_URL}?blogId=${HORANG_BLOG.BLOG_ID}&logNo=${logNo}`;
  const html = await fetchText(url, "text/html");
  const $ = cheerio.load(html);

  const linkdata = $(".se-main-container .se-image .se-module-image-link").first().attr("data-linkdata");
  if (linkdata) {
    try {
      const parsed = JSON.parse(linkdata) as { src?: string };
      if (parsed.src) return toOriginalImageUrl(parsed.src);
    } catch {
      // fall through to img src
    }
  }

  const img = $(".se-main-container .se-image-resource").first();
  const src = img.attr("data-lazy-src") ?? img.attr("src");
  return src ? toOriginalImageUrl(src) : null;
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
    headers: { ...NAVER_HEADERS, Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8" },
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
