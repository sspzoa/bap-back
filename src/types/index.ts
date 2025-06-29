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

export interface CafeteriaData {
  breakfast: ProcessedMeal;
  lunch: ProcessedMeal;
  dinner: ProcessedMeal;
}

export interface CafeteriaResponse {
  date: string;
  data: CafeteriaData;
}

export interface HealthCheckResponse {
  status: string;
  database: {
    connected: boolean;
    totalMealData: number;
    lastUpdated: Date | null;
  };
}