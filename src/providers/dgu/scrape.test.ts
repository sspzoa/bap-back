import { describe, expect, test } from "bun:test";
import { enumerateWeekdays, findArticleForDate, type DflexArticle } from "./scrape";

function article(weekStart: string, weekEnd: string, seq = 1): DflexArticle {
  return { seq, title: `${weekStart} ~ ${weekEnd}`, weekStart, weekEnd };
}

describe("findArticleForDate", () => {
  const week = article("2026-08-17", "2026-08-21");

  test("matches Monday–Saturday of the operating week", () => {
    expect(findArticleForDate([week], "2026-08-17")?.seq).toBe(1);
    expect(findArticleForDate([week], "2026-08-20")?.seq).toBe(1);
    expect(findArticleForDate([week], "2026-08-22")?.seq).toBe(1);
  });

  test("does not match the previous Sunday", () => {
    expect(findArticleForDate([week], "2026-08-16")).toBeNull();
  });
});

describe("enumerateWeekdays", () => {
  test("includes both ends", () => {
    expect(enumerateWeekdays("2026-08-17", "2026-08-21")).toEqual([
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
    ]);
  });
});
