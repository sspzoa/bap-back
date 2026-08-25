import { CONFIG } from "@/core/config";
import { MongoDBService } from "@/core/mongodb";
import { HORANG_CONFIG } from "@/providers/horang/config";
import { getHorangMenu, refreshHorangMenu, runHorangRefresh } from "@/providers/horang/service";
import type { HorangMenu } from "@/providers/horang/types";
import type { MealProvider } from "@/providers/types";

export function createHorangProvider(): MealProvider {
  const config = HORANG_CONFIG;
  const db = new MongoDBService(CONFIG.MONGODB_URI, config.dbName, config.collection);

  return {
    config,
    db,

    async init() {
      await db.connect();
      await db.createIndexes([{ key: { updatedAt: 1 } }]);
    },

    async shutdown() {
      await db.disconnect();
    },

    async getMealData(date: string): Promise<HorangMenu> {
      return getHorangMenu(db, date);
    },

    async refreshMealData(date: string): Promise<HorangMenu> {
      return refreshHorangMenu(db, date);
    },

    async getStats() {
      return db.getStats();
    },

    async runRefresh(type: "today" | "all") {
      return runHorangRefresh(db, type);
    },
  };
}
