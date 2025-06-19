export interface ProcessedMeal {
  regular: string[];
  simple: string[];
}

export interface CafeteriaResponse {
  breakfast: ProcessedMeal;
  lunch: ProcessedMeal;
  dinner: ProcessedMeal;
}

export interface HealthResponse {
  status: string;
  cacheStatus: {
    entries: number;
  };
}