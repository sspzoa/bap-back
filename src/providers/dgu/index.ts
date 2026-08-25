import { CONFIG } from "@/core/config";
import { MongoDBService } from "@/core/mongodb";
import { cornerMenuToPublic } from "@/core/publicMenu";
import type { PublicDayMenu } from "@/core/types";
import { DGU_CONFIG } from "@/providers/dgu/config";
import { getDguMenu, runDguRefresh } from "@/providers/dgu/service";
import type { MealProvider } from "@/providers/types";

export function createDguProvider(): MealProvider {
  const config = DGU_CONFIG;
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

    async getMealData(date: string): Promise<PublicDayMenu> {
      return cornerMenuToPublic(config.presentation.meals, (await getDguMenu(db, date)).meals);
    },

    async getStats() {
      return db.getStats();
    },

    async runRefresh(type: "today" | "all") {
      return runDguRefresh(db, type);
    },
  };
}
