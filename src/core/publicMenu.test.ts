import { describe, expect, test } from "bun:test";
import { cafeteriaToPublic, cornerMenuToPublic } from "@/core/publicMenu";
import type { MealSlotMeta } from "@/core/types";
import { DGU_CONFIG } from "@/providers/dgu/config";
import { KDMHS_CONFIG } from "@/providers/kdmhs/config";

const CAFETERIA_SLOTS: MealSlotMeta[] = KDMHS_CONFIG.presentation.meals;
const CORNER_SLOTS: MealSlotMeta[] = DGU_CONFIG.presentation.meals;

describe("cafeteriaToPublic", () => {
  test("maps regular/plus/simple, kcal, and image onto slots", () => {
    const result = cafeteriaToPublic(CAFETERIA_SLOTS, {
      breakfast: {
        regular: ["흰쌀밥", "미역국"],
        simple: ["샌드위치"],
        plus: ["샐러드"],
        image: "/meal/breakfast.jpg",
        kcal: 450,
      },
      lunch: {
        regular: ["현미밥"],
        simple: [],
        plus: [],
        image: "",
        kcal: 0,
      },
      dinner: {
        regular: [],
        simple: [],
        plus: [],
        image: "",
        kcal: 0,
      },
    });

    expect(result.meals).toHaveLength(3);
    expect(result.meals[0]).toEqual({
      id: "breakfast",
      title: "아침",
      operatingHours: null,
      kcal: 450,
      image: "/meal/breakfast.jpg",
      groups: [
        { id: "regular", label: null, price: null, items: ["흰쌀밥", "미역국"] },
        { id: "plus", label: "플러스바", price: null, items: ["샐러드"] },
        { id: "simple", label: "간편식", price: null, items: ["샌드위치"] },
      ],
    });
    expect(result.meals[1].kcal).toBeNull();
    expect(result.meals[1].image).toBeNull();
    expect(result.meals[2].groups.every((group) => group.items.length === 0)).toBe(true);
  });
});

describe("cornerMenuToPublic", () => {
  test("maps corners onto presentation slots and fills missing meals", () => {
    const result = cornerMenuToPublic(CORNER_SLOTS, [
      {
        time: "중식",
        operatingHours: "11:30~14:00",
        corners: [{ name: "반식(A코너)", price: "6,500", items: ["된장찌개", "김치"] }],
      },
    ]);

    expect(result.meals).toHaveLength(2);
    expect(result.meals[0]).toEqual({
      id: "lunch",
      title: "중식",
      operatingHours: "11:30~14:00",
      kcal: null,
      image: null,
      groups: [{ id: "반식(A코너)", label: "반식(A코너)", price: "6,500", items: ["된장찌개", "김치"] }],
    });
    expect(result.meals[1]).toEqual({
      id: "dinner",
      title: "석식",
      operatingHours: "17:00~19:00",
      kcal: null,
      image: null,
      groups: [],
    });
  });
});
