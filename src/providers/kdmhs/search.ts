import type { FoodSearchResult, MealDataDocument } from "@/providers/kdmhs/types";

const MEAL_TYPES = ["breakfast", "lunch", "dinner"] as const;
const MENU_SECTIONS = ["regular", "simple", "plus"] as const;

interface FoodMatchOptions {
  excludeDate?: string;
}

export function findLatestFoodMatch(
  documents: MealDataDocument[],
  foodName: string,
  options: FoodMatchOptions = {},
): FoodSearchResult | null {
  const query = normalizeSearchText(foodName);
  if (!query) {
    return null;
  }

  for (const document of documents) {
    if (document._id === options.excludeDate) {
      continue;
    }

    for (const mealType of MEAL_TYPES) {
      const meal = document.data[mealType];

      for (const section of MENU_SECTIONS) {
        const menuName = meal[section].find((name) => normalizeSearchText(name).includes(query));

        if (menuName) {
          return {
            image: meal.image,
            date: document._id,
            mealType,
            section,
            menuName,
          };
        }
      }
    }
  }

  return null;
}

function normalizeSearchText(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase();
}
