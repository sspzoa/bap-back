import type { MealSlotMeta, PublicDayMenu, PublicMeal, PublicMenuGroup } from "@/core/types";

export function emptyPublicMeal(slot: MealSlotMeta): PublicMeal {
  return {
    id: slot.id,
    title: slot.title,
    operatingHours: slot.operatingHours,
    kcal: null,
    image: null,
    groups: [],
  };
}

export function fillDayMenu(slots: MealSlotMeta[], mealsById: Map<string, PublicMeal>): PublicDayMenu {
  return {
    meals: slots.map((slot) => mealsById.get(slot.id) ?? emptyPublicMeal(slot)),
  };
}

export interface CornerSource {
  name: string;
  price: string | null;
  items: string[];
}

export interface CornerMealSource {
  time: string;
  operatingHours: string | null;
  corners: CornerSource[];
}

export function cornerMenuToPublic(slots: MealSlotMeta[], meals: CornerMealSource[]): PublicDayMenu {
  const mealsByTitle = new Map(meals.map((meal) => [meal.time, meal]));

  return {
    meals: slots.map((slot) => {
      const found = mealsByTitle.get(slot.title);
      if (!found) {
        return emptyPublicMeal(slot);
      }

      return {
        id: slot.id,
        title: slot.title,
        operatingHours: found.operatingHours ?? slot.operatingHours,
        kcal: null,
        image: null,
        groups: found.corners.map((corner) => ({
          id: corner.name,
          label: corner.name,
          price: corner.price,
          items: corner.items,
        })),
      };
    }),
  };
}

export interface CafeteriaMealSource {
  regular: string[];
  simple: string[];
  plus: string[];
  image: string;
  kcal: number;
}

export interface CafeteriaDaySource {
  breakfast: CafeteriaMealSource;
  lunch: CafeteriaMealSource;
  dinner: CafeteriaMealSource;
}

function cafeteriaGroups(source: CafeteriaMealSource): PublicMenuGroup[] {
  return [
    { id: "regular", label: null, price: null, items: source.regular },
    { id: "plus", label: "플러스바", price: null, items: source.plus },
    { id: "simple", label: "간편식", price: null, items: source.simple },
  ];
}

function cafeteriaMealToPublic(slot: MealSlotMeta, source: CafeteriaMealSource): PublicMeal {
  return {
    id: slot.id,
    title: slot.title,
    operatingHours: slot.operatingHours,
    kcal: source.kcal > 0 ? source.kcal : null,
    image: source.image || null,
    groups: cafeteriaGroups(source),
  };
}

export function cafeteriaToPublic(slots: MealSlotMeta[], data: CafeteriaDaySource): PublicDayMenu {
  const sourceById: Record<string, CafeteriaMealSource> = {
    breakfast: data.breakfast,
    lunch: data.lunch,
    dinner: data.dinner,
  };

  return {
    meals: slots.map((slot) => {
      const source = sourceById[slot.id];
      return source ? cafeteriaMealToPublic(slot, source) : emptyPublicMeal(slot);
    }),
  };
}
