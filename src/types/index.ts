export interface MealMenu {
  breakfast: string;
  lunch: string;
  dinner: string;
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

export interface CafeteriaResponse extends MealMenu {
  images: MealImages;
}

export interface HealthResponse {
  status: string;
  cacheStatus: Record<string, boolean>;
}