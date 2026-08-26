import { CONFIG } from "@/core/config";
import { ApiError } from "@/core/errors";
import { MongoDBService } from "@/core/mongodb";
import { cafeteriaToPublic } from "@/core/publicMenu";
import type { PublicDayMenu } from "@/core/types";
import { KDMHS_CONFIG } from "@/providers/kdmhs/config";
import { getCafeteriaData, runKdmhsRefresh, searchLatestFoodImage } from "@/providers/kdmhs/service";
import type { MealProvider } from "@/providers/types";

export function createKdmhsProvider(): MealProvider {
  const config = KDMHS_CONFIG;
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
      return cafeteriaToPublic(config.presentation.meals, await getCafeteriaData(db, date));
    },

    async getStats() {
      return db.getStats();
    },

    async runRefresh(type: "today" | "all") {
      return runKdmhsRefresh(db, type);
    },

    async handleExtraRoute(subPath, method) {
      const searchMatch = subPath.match(/^\/search\/(.+)$/);
      if (searchMatch && method === "GET") {
        const foodName = decodeURIComponent(searchMatch[1]);
        const result = await searchLatestFoodImage(db, foodName);

        if (!result) {
          throw new ApiError(404, "해당 메뉴를 찾을 수 없어요");
        }

        return {
          foodName,
          matchedMenu: result.menuName,
          image: result.image,
          date: result.date,
          mealType: result.mealType,
          section: result.section,
        };
      }

      return null;
    },
  };
}
