import { CONFIG } from "@/core/config";
import { MongoDBService } from "@/core/mongodb";
import { DGU_CONFIG } from "@/providers/dgu/config";
import { getDguCafeteriaData, refreshDguCafeteriaData, runDguRefresh } from "@/providers/dgu/service";
import type { DguCafeteriaData } from "@/providers/dgu/types";
import type { MealProvider } from "@/providers/types";

export function createDguProvider(): MealProvider {
  const config = DGU_CONFIG;
  const db = new MongoDBService(CONFIG.MONGODB_URI, config.dbName, config.collection);

  return {
    config,
    db,

    async init() {
      await db.connect();
      await db.createIndexes([
        { key: { createdAt: 1 } },
        { key: { updatedAt: 1 } },
      ]);
    },

    async shutdown() {
      await db.disconnect();
    },

    async getMealData(date: string): Promise<DguCafeteriaData> {
      return getDguCafeteriaData(db, date);
    },

    async refreshMealData(date: string): Promise<DguCafeteriaData> {
      return refreshDguCafeteriaData(db, date);
    },

    async getStats() {
      return db.getStats();
    },

    async runRefresh(type: "today" | "all") {
      return runDguRefresh(db, type);
    },
  };
}
