import { describe, expect, test } from "bun:test";
import { MealNoOperationError, MealNotFoundError } from "@/core/errors";
import type { MongoDBService } from "@/core/mongodb";
import { getCafeteriaData } from "@/providers/kdmhs/service";
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
