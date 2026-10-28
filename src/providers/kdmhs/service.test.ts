import { describe, expect, test } from "bun:test";
import { MealNoOperationError, MealNotFoundError } from "@/core/errors";
import type { MongoDBService } from "@/core/mongodb";
import { extractWeeklyMenu } from "@/providers/kdmhs/ai";
import { extractWeekData, getCafeteriaData, refreshTodayImages } from "@/providers/kdmhs/service";
import type { CafeteriaData, CafeteriaWeekData, WeekMenuSource } from "@/providers/kdmhs/types";

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

function aiWeek(source: WeekMenuSource) {
  const week: CafeteriaWeekData = Object.fromEntries(source.dates.map((date) => [date, emptyDay()]));
  for (const meal of source.meals) {
    week[meal.date][meal.mealType] = {
      regular: [`AI ${meal.text}`],
      simple: [],
      plus: [],
      image: meal.image,
      kcal: meal.kcal,
    };
  }
  return week;
}

describe("extractWeekData", () => {
  test("sends only meals whose text changed and keeps stored menus for the rest", async () => {
    const { db } = memoryDb({
      "2026-08-17": storedDay({ regular: ["저장된 현미밥"], source: "현미밥 / 김치찌개", image: "old.jpg" }),
    });
    const sent: string[] = [];
    const week = await extractWeekData(db, WEEK_HTML, "2026-08-17", async (source) => {
      sent.push(...source.meals.map((meal) => `${meal.date}/${meal.mealType}`));
      return aiWeek(source);
    });

    expect(sent).toEqual(["2026-08-18/lunch", "2026-08-17/dinner"]);
    expect(week["2026-08-17"].lunch).toEqual({
      regular: ["저장된 현미밥"],
      simple: [],
      plus: [],
      image: "https://dimigo-h.goeas.kr/meal/lunch.jpg",
      kcal: 820,
      source: "현미밥 / 김치찌개",
    });
    expect(week["2026-08-17"].dinner.regular).toEqual(["AI 카레라이스"]);
    expect(week["2026-08-17"].dinner.source).toBe("카레라이스");
  });

  test("makes no AI request when nothing changed", async () => {
    const { db } = memoryDb({
      "2026-08-17": {
        ...storedDay({ regular: ["저장된 현미밥"], source: "현미밥 / 김치찌개" }),
        dinner: { regular: ["저장된 카레"], simple: [], plus: [], image: "", kcal: 0, source: "카레라이스" },
      },
      "2026-08-18": storedDay({ regular: ["저장된 잡곡밥"], source: "잡곡밥" }),
    });
    const requested: number[] = [];
    const week = await extractWeekData(db, WEEK_HTML, "2026-08-17", async (source) => {
      requested.push(source.meals.length);
      return extractWeeklyMenu(source);
    });

    expect(requested).toEqual([0]);
    expect(week["2026-08-17"].dinner.regular).toEqual(["저장된 카레"]);
    expect(week["2026-08-18"].lunch.regular).toEqual(["저장된 잡곡밥"]);
  });

  test("falls back to the HTML parser for changed meals without recording their source", async () => {
    const { db } = memoryDb({
      "2026-08-18": storedDay({ regular: ["저장된 잡곡밥"], source: "잡곡밥" }),
    });
    const week = await extractWeekData(db, WEEK_HTML, "2026-08-17", async () => {
      throw new Error("gateway down");
    });

    expect(week["2026-08-17"].lunch.regular).toEqual(["현미밥", "김치찌개"]);
    expect(week["2026-08-17"].lunch.source).toBeUndefined();
    expect(week["2026-08-18"].lunch.regular).toEqual(["저장된 잡곡밥"]);
  });
});

describe("refreshTodayImages", () => {
  const fetchHtml = async () => WEEK_HTML;

  test("updates only today's photo and kcal and keeps the stored menu", async () => {
    const { db, saved } = memoryDb({
      "2026-08-17": storedDay({ regular: ["AI 현미밥"], source: "현미밥 / 김치찌개" }),
    });
    await refreshTodayImages(db, "2026-08-17", fetchHtml);

    expect(saved).toHaveLength(1);
    const [date, data] = saved[0];
    expect(date).toBe("2026-08-17");
    expect(data.lunch).toEqual({
      regular: ["AI 현미밥"],
      simple: [],
      plus: [],
      image: "https://dimigo-h.goeas.kr/meal/lunch.jpg",
      kcal: 820,
      source: "현미밥 / 김치찌개",
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
