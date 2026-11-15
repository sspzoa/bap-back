export interface ProcessedMeal {
  regular: string[];
  simple: string[];
  plus: string[];
  image: string;
  kcal: number;
}

export interface CafeteriaData {
  breakfast: ProcessedMeal;
  lunch: ProcessedMeal;
  dinner: ProcessedMeal;
}

export interface CafeteriaWeekData {
  [date: string]: CafeteriaData;
}

export interface MealDataDocument {
  _id: string;
  data: CafeteriaData;
  createdAt: Date;
  updatedAt: Date;
}

export interface FoodSearchResult {
  image: string;
  date: string;
  mealType: "breakfast" | "lunch" | "dinner";
  section: "regular" | "simple" | "plus";
  menuName: string;
}
