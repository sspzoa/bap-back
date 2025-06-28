export interface MenuPost {
  documentId: string;
  title: string;
  date: string;
}

export interface ProcessedMeal {
  regular: string[];
  simple: string[];
  image: string;
}

export interface ProcessedMealMenu {
  breakfast: ProcessedMeal;
  lunch: ProcessedMeal;
  dinner: ProcessedMeal;
}

export interface CafeteriaResponse {
  breakfast: ProcessedMeal;
  lunch: ProcessedMeal;
  dinner: ProcessedMeal;
}