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
  /** Primary route prefix, e.g. "/kdmhs" or "/dgu" */
  basePath: string;
  /** Extra prefixes that map to the same provider. "" keeps root routes. */
  aliases?: string[];
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
   * Return a JSON payload if handled, null to fall through to 404.
   */
  handleExtraRoute?(subPath: string, method: string): Promise<unknown | null>;
}
