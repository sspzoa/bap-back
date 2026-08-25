import { CONFIG } from "@/core/config";
import { MongoDBService } from "@/core/mongodb";
import { cornerMenuToPublic } from "@/core/publicMenu";
import type { PublicDayMenu } from "@/core/types";
import { HORANG_CONFIG } from "@/providers/horang/config";
import { getHorangMenu, runHorangRefresh } from "@/providers/horang/service";
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

    async getMealData(date: string): Promise<PublicDayMenu> {
      return cornerMenuToPublic(config.presentation.meals, (await getHorangMenu(db, date)).meals);
    },

    async getStats() {
      return db.getStats();
    },

    async runRefresh(type: "today" | "all") {
      return runHorangRefresh(db, type);
    },
  };
}
