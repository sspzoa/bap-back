import type { MongoDBService } from "@/core/mongodb";
import type { PublicDayMenu, SitePresentation } from "@/core/types";

export interface ScheduleEntry {
  day: number;
  hour: number;
  minute: number;
  refreshType: "today" | "all";
}

export interface ProviderConfig {
  id: string;
  name: string;
  /** Route prefix, e.g. "/kdmhs" or "/dgu" */
  basePath: string;
  dbName: string;
  collection: string;
  schedule: ScheduleEntry[];
  presentation: SitePresentation;
}

export interface MealProvider {
  readonly config: ProviderConfig;
  readonly db: MongoDBService;

  init(): Promise<void>;
  shutdown(): Promise<void>;

  getMealData(date: string): Promise<PublicDayMenu>;
  getStats(): Promise<{ totalMealData: number; lastUpdated: Date | null }>;
  runRefresh(type: "today" | "all"): Promise<void>;

  /**
   * Handle routes beyond the standard health/date.
   * Return a JSON payload if handled, null to fall through to 404.
   */
  handleExtraRoute?(subPath: string, method: string): Promise<unknown | null>;
}
