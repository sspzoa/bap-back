import { describe, expect, test } from "bun:test";
import { MealNoOperationError, MealNotFoundError } from "@/core/errors";
import { getCachedMealDataOrThrow } from "@/core/mealLookup";
import type { MongoDBService } from "@/core/mongodb";

function fakeDb(docs: Record<string, unknown>): MongoDBService {
  const ids = Object.keys(docs).sort();

  return {
    getMealData: async (date: string) => (docs[date] as never) ?? null,
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

describe("getCachedMealDataOrThrow", () => {
  test("returns a cache hit", async () => {
    const data = await getCachedMealDataOrThrow<{ value: string }>(
      fakeDb({ "2026-08-20": { value: "ok" } }),
      "2026-08-20",
    );
    expect(data.value).toBe("ok");
  });

  test("throws MealNotFoundError when the date is outside stored range", async () => {
    const db = fakeDb({ "2026-08-17": {}, "2026-08-21": {} });
    await expect(getCachedMealDataOrThrow(db, "2026-08-10")).rejects.toBeInstanceOf(MealNotFoundError);
    await expect(getCachedMealDataOrThrow(db, "2026-08-25")).rejects.toBeInstanceOf(MealNotFoundError);
  });

  test("throws MealNoOperationError when the date is in range but missing", async () => {
    const db = fakeDb({ "2026-08-17": {}, "2026-08-21": {} });
    await expect(getCachedMealDataOrThrow(db, "2026-08-19")).rejects.toBeInstanceOf(MealNoOperationError);
  });

  test("throws MealNotFoundError when the collection is empty", async () => {
    await expect(getCachedMealDataOrThrow(fakeDb({}), "2026-08-20")).rejects.toBeInstanceOf(MealNotFoundError);
  });
});
