export interface MenuPost {
  documentId: string;
  title: string;
  date: string;
  registrationDate: string;
}

export interface ProcessedMeal {
  regular: string[];
  simple: string[];
  plus: string[];
  image: string;
  kcal: number;
}

export interface ProcessedMealMenu {
  breakfast: ProcessedMeal;
  lunch: ProcessedMeal;
  dinner: ProcessedMeal;
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
  documentId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FoodSearchResult {
  image: string;
  date: string;
  mealType: "breakfast" | "lunch" | "dinner";
}
