import { describe, expect, test } from "bun:test";
import { findLatestFoodMatch } from "@/providers/kdmhs/search";
import type { CafeteriaData, MealDataDocument } from "@/providers/kdmhs/types";

function emptyMeal(image = "") {
  return { regular: [], simple: [], plus: [], image, kcal: 0 };
}

function document(_id: string, data: CafeteriaData): MealDataDocument {
  return {
    _id,
    data,
    documentId: _id,
    createdAt: new Date(_id),
    updatedAt: new Date(_id),
  };
}

describe("findLatestFoodMatch", () => {
  test("searches plus menus and does not require an image", () => {
    const result = findLatestFoodMatch(
      [
        document("2026-05-20", {
          breakfast: emptyMeal(),
          lunch: { ...emptyMeal(), plus: ["셀프바 김치전"] },
          dinner: emptyMeal(),
        }),
      ],
      "김치전",
    );

    expect(result).toEqual({
      image: "",
      date: "2026-05-20",
      mealType: "lunch",
      section: "plus",
      menuName: "셀프바 김치전",
    });
  });

  test("matches menu names without depending on spaces", () => {
    const result = findLatestFoodMatch(
      [
        document("2026-05-20", {
          breakfast: emptyMeal(),
          lunch: { ...emptyMeal("image-url"), regular: ["콘 크러스트 피자"] },
          dinner: emptyMeal(),
        }),
      ],
      "콘크러스트",
    );

    expect(result?.menuName).toBe("콘 크러스트 피자");
    expect(result?.image).toBe("image-url");
  });

  test("uses the newest document order before meal type order", () => {
    const result = findLatestFoodMatch(
      [
        document("2026-05-20", {
          breakfast: emptyMeal(),
          lunch: emptyMeal(),
          dinner: { ...emptyMeal("new"), regular: ["치킨마요"] },
        }),
        document("2026-05-19", {
          breakfast: { ...emptyMeal("old"), regular: ["치킨마요"] },
          lunch: emptyMeal(),
          dinner: emptyMeal(),
        }),
      ],
      "치킨",
    );

    expect(result?.date).toBe("2026-05-20");
    expect(result?.mealType).toBe("dinner");
  });
});
