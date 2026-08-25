import { CONFIG } from "@/core/config";
import { MongoDBService } from "@/core/mongodb";
import { MEGA_CONFIG } from "@/providers/mega/config";
import { getMegaMenu, refreshMegaMenu, runMegaRefresh } from "@/providers/mega/service";
import type { MegaMenu } from "@/providers/mega/types";
import type { MealProvider } from "@/providers/types";

export function createMegaProvider(): MealProvider {
  const config = MEGA_CONFIG;
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

    async getMealData(date: string): Promise<MegaMenu> {
      return getMegaMenu(db, date);
    },

    async refreshMealData(date: string): Promise<MegaMenu> {
      return refreshMegaMenu(db, date);
    },

    async getStats() {
      return db.getStats();
    },

    async runRefresh(type: "today" | "all") {
      return runMegaRefresh(db, type);
    },
  };
}
