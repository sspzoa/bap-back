import { describe, expect, test } from "bun:test";
import { extractWeeklyMenu, mergeMenuResult } from "@/providers/kdmhs/ai";
import type { WeekMenuSource } from "@/providers/kdmhs/types";

const SOURCE: WeekMenuSource = {
  dates: ["2026-08-17", "2026-08-18"],
  meals: [
    {
      date: "2026-08-17",
      mealType: "breakfast",
      text: "흰쌀밥\n<간편식> 샌드위치",
      image: "https://x/b.jpg",
      kcal: 450,
    },
    { date: "2026-08-17", mealType: "lunch", text: "현미밥", image: "", kcal: 820 },
  ],
};

const meal = (date: string, mealType: string, regular: string[], simple: string[] = []) => ({
  date,
  mealType,
  regular,
  plus: [],
  simple,
});

describe("mergeMenuResult", () => {
  test("merges AI menus with HTML image and kcal and fills empty dates", () => {
    const week = mergeMenuResult(SOURCE, {
      meals: [meal("2026-08-17", "breakfast", ["흰쌀밥"], ["샌드위치"]), meal("2026-08-17", "lunch", ["현미밥"])],
    });

    expect(Object.keys(week)).toEqual(["2026-08-17", "2026-08-18"]);
    expect(week["2026-08-17"].breakfast).toEqual({
      regular: ["흰쌀밥"],
      plus: [],
      simple: ["샌드위치"],
      image: "https://x/b.jpg",
      kcal: 450,
    });
    expect(week["2026-08-17"].lunch.kcal).toBe(820);
    expect(week["2026-08-18"].lunch.regular).toEqual([]);
  });

  test("rejects omitted meals", () => {
    expect(() => mergeMenuResult(SOURCE, { meals: [meal("2026-08-17", "lunch", ["현미밥"])] })).toThrow(
      "omitted meals: 2026-08-17/breakfast",
    );
  });

  test("rejects duplicate or unexpected meals", () => {
    const lunch = meal("2026-08-17", "lunch", ["현미밥"]);
    const breakfast = meal("2026-08-17", "breakfast", ["흰쌀밥"]);
    expect(() => mergeMenuResult(SOURCE, { meals: [breakfast, lunch, lunch] })).toThrow("duplicate meal");
    expect(() => mergeMenuResult(SOURCE, { meals: [breakfast, lunch, meal("2026-08-18", "dinner", ["밥"])] })).toThrow(
      "unexpected or duplicate meal: 2026-08-18/dinner",
    );
  });

  test("rejects malformed results", () => {
    expect(() => mergeMenuResult(SOURCE, { meals: [{ ...meal("2026-08-17", "lunch", [""]) }] })).toThrow();
    expect(() => mergeMenuResult(SOURCE, { meals: [{ ...meal("2026-08-17", "lunch", ["밥"]), extra: 1 }] })).toThrow();
  });
});

describe("extractWeeklyMenu", () => {
  test("skips the AI call when no meal has text", async () => {
    const week = await extractWeeklyMenu({ dates: ["2026-08-17"], meals: [] });
    expect(Object.keys(week)).toEqual(["2026-08-17"]);
    expect(week["2026-08-17"].dinner.regular).toEqual([]);
  });
});
