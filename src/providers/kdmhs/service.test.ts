import { describe, expect, test } from "bun:test";
import { MealNoOperationError, MealNotFoundError } from "@/core/errors";
import type { MongoDBService } from "@/core/mongodb";
import { extractWeekData, getCafeteriaData } from "@/providers/kdmhs/service";
import type { CafeteriaData } from "@/providers/kdmhs/types";

function emptyDay(): CafeteriaData {
  const meal = { regular: [], simple: [], plus: [], image: "", kcal: 0 };
  return { breakfast: meal, lunch: meal, dinner: meal };
}

function fakeDb(docs: Record<string, CafeteriaData>): MongoDBService {
  const ids = Object.keys(docs).sort();

  return {
    getMealData: async (date: string) => docs[date] ?? null,
    getCollection: () => ({
      find: () => ({
        sort: ({ _id }: { _id: 1 | -1 }) => ({
          limit: () => ({
            toArray: async () => {
              if (ids.length === 0) {
                return [];
              }
              return [{ _id: _id === 1 ? ids[0] : ids[ids.length - 1] }];
            },
          }),
        }),
      }),
    }),
  } as unknown as MongoDBService;
}

describe("getCafeteriaData", () => {
  test("returns a cache hit", async () => {
    const day = emptyDay();
    day.lunch.regular = ["쌀밥"];
    const data = await getCafeteriaData(fakeDb({ "2026-08-20": day }), "2026-08-20");
    expect(data.lunch.regular).toEqual(["쌀밥"]);
  });

  test("throws MealNotFoundError when the date is outside stored range", async () => {
    const db = fakeDb({ "2026-08-17": emptyDay(), "2026-08-21": emptyDay() });
    await expect(getCafeteriaData(db, "2026-08-10")).rejects.toBeInstanceOf(MealNotFoundError);
    await expect(getCafeteriaData(db, "2026-08-25")).rejects.toBeInstanceOf(MealNotFoundError);
  });

  test("throws MealNoOperationError when the date is in range but missing", async () => {
    const db = fakeDb({ "2026-08-17": emptyDay(), "2026-08-21": emptyDay() });
    await expect(getCafeteriaData(db, "2026-08-19")).rejects.toBeInstanceOf(MealNoOperationError);
  });

  test("throws MealNotFoundError when the collection is empty", async () => {
    await expect(getCafeteriaData(fakeDb({}), "2026-08-20")).rejects.toBeInstanceOf(MealNotFoundError);
  });
});

describe("extractWeekData", () => {
  const html = `
    <table>
      <thead><tr><th>구분</th><th>2026-08-17 (월)</th></tr></thead>
      <tbody><tr><th>중식</th><td><p>현미밥 / 김치찌개</p></td></tr></tbody>
    </table>
  `;

  test("uses the AI result when extraction succeeds", async () => {
    const aiWeek = { "2026-08-17": emptyDay() };
    aiWeek["2026-08-17"].lunch = { regular: ["AI 현미밥"], simple: [], plus: [], image: "", kcal: 0 };
    const week = await extractWeekData(html, "2026-08-17", async (source) => {
      expect(source.meals).toEqual([
        { date: "2026-08-17", mealType: "lunch", text: "현미밥 / 김치찌개", image: "", kcal: 0 },
      ]);
      return aiWeek;
    });
    expect(week["2026-08-17"].lunch.regular).toEqual(["AI 현미밥"]);
  });

  test("falls back to the HTML parser when extraction fails", async () => {
    const week = await extractWeekData(html, "2026-08-17", async () => {
      throw new Error("gateway down");
    });
    expect(week["2026-08-17"].lunch.regular).toEqual(["현미밥", "김치찌개"]);
  });
});
