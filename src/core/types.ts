export interface HealthCheckResponse {
  requestId: string;
  timestamp: string;
  status: string;
  database: {
    connected: boolean;
    totalMealData: number;
    lastUpdated: Date | null;
  };
}

export interface MealResponse<TData = unknown> {
  requestId: string;
  timestamp: string;
  date: string;
  data: TData;
}
