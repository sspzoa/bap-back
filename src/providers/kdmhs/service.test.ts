import { describe, expect, test } from "bun:test";
import { MealNoOperationError, MealNotFoundError } from "@/core/errors";
import type { MongoDBService } from "@/core/mongodb";
import {
  getCafeteriaData,
  getWeekMealData,
  kdmhsAllWeekAnchors,
  refreshTodayImages,
  runKdmhsRefresh,
} from "@/providers/kdmhs/service";
import type { CafeteriaData } from "@/providers/kdmhs/types";
import { parseLocalDate } from "@/utils/date";

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

const WEEK_HTML = `
  <table>
    <thead><tr><th>구분</th><th>2026-08-17 (월)</th><th>2026-08-18 (화)</th></tr></thead>
    <tbody>
      <tr>
        <th>중식</th>
        <td><p class="fm_tit_p">820kcal</p><p class="fm_img"><img src="/meal/lunch.jpg" /></p><p>현미밥 / 김치찌개</p></td>
        <td><p>잡곡밥</p></td>
      </tr>
      <tr>
        <th>석식</th>
        <td><p>카레라이스</p></td>
        <td><p>상세보기</p></td>
      </tr>
    </tbody>
  </table>
`;

function storedDay(lunch: Partial<CafeteriaData["lunch"]>): CafeteriaData {
  const day = emptyDay();
  day.lunch = { ...day.lunch, ...lunch };
  return day;
}

function memoryDb(docs: Record<string, CafeteriaData>) {
  const saved: Array<[string, CafeteriaData]> = [];
  const db = {
    getMealData: async (date: string) => (docs[date] ? structuredClone(docs[date]) : null),
    saveMealData: async (date: string, data: CafeteriaData) => {
      saved.push([date, data]);
    },
  } as unknown as MongoDBService;
  return { db, saved };
}

describe("getWeekMealData", () => {
  test("replaces stored menus with the rule parser and keeps a photo the page omits", async () => {
    const { db, saved } = memoryDb({
      "2026-08-17": storedDay({ regular: ["족발"], image: "kept.jpg", kcal: 1 }),
    });

    const week = await getWeekMealData(db, "2026-08-17", async () => WEEK_HTML);

    expect(week["2026-08-17"].lunch.regular).toEqual(["현미밥", "김치찌개"]);
    expect(week["2026-08-17"].lunch.image).toBe("https://dimigo-h.goeas.kr/meal/lunch.jpg");
    expect(week["2026-08-17"].lunch.kcal).toBe(820);
    expect(week["2026-08-18"].lunch.regular).toEqual(["잡곡밥"]);
    expect(saved.some(([date, data]) => date === "2026-08-17" && data.lunch.regular[0] === "현미밥")).toBe(true);
  });

  test("does not clear a stored photo or kcal when the new cell has neither", async () => {
    const { db } = memoryDb({
      "2026-08-18": storedDay({ regular: ["옛 잡곡밥"], image: "kept.jpg", kcal: 700 }),
    });

    const week = await getWeekMealData(db, "2026-08-17", async () => WEEK_HTML);

    expect(week["2026-08-18"].lunch).toEqual({
      regular: ["잡곡밥"],
      simple: [],
      plus: [],
      image: "kept.jpg",
      kcal: 700,
    });
  });
});

describe("refreshTodayImages", () => {
  const fetchHtml = async () => WEEK_HTML;

  test("updates only today's photo and kcal and keeps the stored menu", async () => {
    const { db, saved } = memoryDb({
      "2026-08-17": storedDay({ regular: ["현미밥", "김치찌개"] }),
    });
    await refreshTodayImages(db, "2026-08-17", fetchHtml);

    expect(saved).toHaveLength(1);
    const [date, data] = saved[0];
    expect(date).toBe("2026-08-17");
    expect(data.lunch).toEqual({
      regular: ["현미밥", "김치찌개"],
      simple: [],
      plus: [],
      image: "https://dimigo-h.goeas.kr/meal/lunch.jpg",
      kcal: 820,
    });
  });

  test("does not save when nothing changed or nothing is stored", async () => {
    const unchanged = memoryDb({
      "2026-08-17": storedDay({ image: "https://dimigo-h.goeas.kr/meal/lunch.jpg", kcal: 820 }),
    });
    await refreshTodayImages(unchanged.db, "2026-08-17", fetchHtml);
    expect(unchanged.saved).toHaveLength(0);

    const missing = memoryDb({});
    await refreshTodayImages(missing.db, "2026-08-17", fetchHtml);
    expect(missing.saved).toHaveLength(0);
  });

  test("never clears a stored photo with an empty value", async () => {
    const { db, saved } = memoryDb({ "2026-08-18": storedDay({ image: "kept.jpg", kcal: 700 }) });
    await refreshTodayImages(db, "2026-08-18", fetchHtml);
    expect(saved).toHaveLength(0);
  });
});

describe("kdmhsAllWeekAnchors", () => {
  test("backfill covers every school week since 2026-10-25, then later runs keep the previous week", () => {
    const sunday = parseLocalDate("2026-11-15");
    expect(kdmhsAllWeekAnchors(sunday, true)).toEqual([
      "2026-10-25",
      "2026-11-01",
      "2026-11-08",
      "2026-11-15",
      "2026-11-22",
    ]);
    expect(kdmhsAllWeekAnchors(sunday, false)).toEqual(["2026-11-08", "2026-11-15", "2026-11-22"]);
    expect(kdmhsAllWeekAnchors(parseLocalDate("2026-11-18"), false)).toEqual([
      "2026-11-08",
      "2026-11-15",
      "2026-11-22",
    ]);
  });
});

function weekPage(date: string): string {
  return `<table><thead><tr><th>구분</th><th>${date}</th></tr></thead><tbody><tr><th>중식</th><td><p>쌀밥</p></td></tr></tbody></table>`;
}

function jobDb(initial: Record<string, CafeteriaData> = {}) {
  const jobs = new Map<string, { completedAt: Date }>();
  const meals = new Map(Object.entries(initial));
  const db = {
    getMealData: async (date: string) => (meals.has(date) ? structuredClone(meals.get(date)) : null),
    saveMealData: async (date: string, data: CafeteriaData) => {
      meals.set(date, structuredClone(data));
    },
    getDb: () => ({
      collection: () => ({
        findOne: async (filter: { _id: string }) => jobs.get(filter._id) ?? null,
        updateOne: async (filter: { _id: string }) => {
          if (!jobs.has(filter._id)) jobs.set(filter._id, { completedAt: new Date() });
        },
      }),
    }),
  } as unknown as MongoDBService;
  return { db, jobs };
}

describe("runKdmhsRefresh", () => {
  const now = parseLocalDate("2026-11-15");

  test("re-parses weeks since 2026-10-25 once, then only the previous, current, and next weeks", async () => {
    const { db, jobs } = jobDb();
    const fetched: string[] = [];
    const fetchHtml = async (date: string) => {
      fetched.push(date);
      return weekPage(date);
    };

    await runKdmhsRefresh(db, "all", { now, fetchHtml });
    expect(fetched).toEqual(["2026-10-25", "2026-11-01", "2026-11-08", "2026-11-15", "2026-11-22"]);
    expect(jobs.size).toBe(1);

    fetched.length = 0;
    await runKdmhsRefresh(db, "all", { now, fetchHtml });
    expect(fetched).toEqual(["2026-11-08", "2026-11-15", "2026-11-22"]);
    expect(jobs.size).toBe(1);
  });

  test("retries the backfill when a week fails", async () => {
    const { db, jobs } = jobDb();
    const fetchHtml = async (date: string) => {
      if (date === "2026-11-01") throw new Error("down");
      return weekPage(date);
    };

    await runKdmhsRefresh(db, "all", { now, fetchHtml });
    expect(jobs.size).toBe(0);
  });

  test("today refresh only fetches the current day", async () => {
    const { db, jobs } = jobDb({ "2026-11-15": storedDay({ regular: ["쌀밥"] }) });
    const fetched: string[] = [];
    await runKdmhsRefresh(db, "today", {
      now,
      fetchHtml: async (date) => {
        fetched.push(date);
        return weekPage(date);
      },
    });

    expect(fetched).toEqual(["2026-11-15"]);
    expect(jobs.size).toBe(0);
  });
});
