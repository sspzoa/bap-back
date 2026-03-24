import type { MongoDBService } from "@/core/mongodb";

export interface ScheduleEntry {
  day: number;
  hour: number;
  minute: number;
  refreshType: "today" | "all";
}

export interface ProviderConfig {
  id: string;
  name: string;
  /** "" for root-level routes, "/dgu" for /dgu/* prefix */
  basePath: string;
  origins: string[];
  dbName: string;
  collection: string;
  schedule: ScheduleEntry[];
}

export interface MealProvider {
  readonly config: ProviderConfig;
  readonly db: MongoDBService;

  init(): Promise<void>;
  shutdown(): Promise<void>;

  getMealData(date: string): Promise<unknown>;
  refreshMealData(date: string): Promise<unknown>;
  getStats(): Promise<{ totalMealData: number; lastUpdated: Date | null }>;
  runRefresh(type: "today" | "all"): Promise<void>;

  /**
   * Handle routes beyond the standard health/date/refresh.
   * Return Response if handled, null to fall through to 404.
   */
  handleExtraRoute?(
    subPath: string,
    method: string,
    requestId: string,
    origin: string | null,
  ): Promise<Response | null>;
}
