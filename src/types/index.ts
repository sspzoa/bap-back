export interface MealMenu {
  breakfast: string;
  lunch: string;
  dinner: string;
}

export interface ProcessedMeal {
  regular: string[];
  simple: string[];
}

export interface ProcessedMealMenu {
  breakfast: ProcessedMeal;
  lunch: ProcessedMeal;
  dinner: ProcessedMeal;
}

export interface MealImages {
  breakfast: string;
  lunch: string;
  dinner: string;
}

export interface MenuPost {
  documentId: string;
  title: string;
  date: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface CafeteriaResponse {
  meals: ProcessedMealMenu;
  images: MealImages;
}

export interface HealthResponse {
  status: string;
  cacheStatus: Record<string, boolean>;
}