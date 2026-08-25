import { describe, expect, test } from "bun:test";
import {
  decodePostTitle,
  enumerateWeekdays,
  findArticleForDate,
  type HorangArticle,
  parseWeekRange,
  toOriginalImageUrl,
} from "./scrape";

function article(weekStart: string, weekEnd: string, logNo = "1"): HorangArticle {
  return { logNo, title: `${weekStart} ~ ${weekEnd}`, weekStart, weekEnd };
}

describe("decodePostTitle", () => {
  test("decodes percent-encoding and plus-as-space", () => {
    expect(
      decodePostTitle(
        "%5B%EB%A9%94%EA%B0%80%EC%8A%A4%ED%84%B0%EB%94%94+%EA%B5%AC%EB%82%B4%EC%8B%9D%EB%8B%B9%5D+2026.08.24%7E08.28%EC%A3%BC%EA%B0%84%EB%A9%94%EB%89%B4%ED%91%9C",
      ),
    ).toBe("[메가스터디 구내식당] 2026.08.24~08.28주간메뉴표");
  });
});

describe("parseWeekRange", () => {
  test("parses the current dotted tilde format", () => {
    expect(parseWeekRange("[메가스터디 구내식당] 2026.08.24~08.28주간메뉴표")).toEqual({
      weekStart: "2026-08-24",
      weekEnd: "2026-08-28",
    });
  });

  test("allows a space before 주간메뉴표", () => {
    expect(parseWeekRange("[메가스터디 구내식당] 2026.07.13~07.17 주간메뉴표")).toEqual({
      weekStart: "2026-07-13",
      weekEnd: "2026-07-17",
    });
  });

  test("parses the older unpadded hyphen format", () => {
    expect(parseWeekRange("[ 메가스터디 구내식당 ] 2025.3.3-3.7 주간메뉴표")).toEqual({
      weekStart: "2025-03-03",
      weekEnd: "2025-03-07",
    });
  });

  test("rolls the year when the range crosses January", () => {
    expect(parseWeekRange("[메가스터디 구내식당] 2025.12.29~01.02 주간메뉴표")).toEqual({
      weekStart: "2025-12-29",
      weekEnd: "2026-01-02",
    });
  });

  test("ignores review posts that are not weekly menus", () => {
    expect(parseWeekRange("[메가스터디 구내식당] 7월 5주~8월1주 만족도 베스트 메뉴 리뷰 TOP 3")).toBeNull();
  });
});

describe("findArticleForDate", () => {
  const week = article("2026-08-24", "2026-08-28");

  test("matches Monday–Friday of the operating week", () => {
    expect(findArticleForDate([week], "2026-08-24")?.logNo).toBe("1");
    expect(findArticleForDate([week], "2026-08-26")?.logNo).toBe("1");
    expect(findArticleForDate([week], "2026-08-28")?.logNo).toBe("1");
  });

  test("does not match the surrounding weekend", () => {
    expect(findArticleForDate([week], "2026-08-23")).toBeNull();
    expect(findArticleForDate([week], "2026-08-29")).toBeNull();
  });
});

describe("toOriginalImageUrl", () => {
  test("rewrites Naver thumbs to blogfiles and drops size query", () => {
    const thumb = "https://mblogthumb-phinf.pstatic.net/MjAyNjA4MjFfMTcy/foo.JPEG/menu.jpg?type=w800";
    expect(toOriginalImageUrl(thumb)).toBe("https://blogfiles.pstatic.net/MjAyNjA4MjFfMTcy/foo.JPEG/menu.jpg");
  });
});

describe("enumerateWeekdays", () => {
  test("includes both ends", () => {
    expect(enumerateWeekdays("2026-08-24", "2026-08-28")).toEqual([
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
    ]);
  });
});
