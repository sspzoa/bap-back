import { getCorsHeaders } from "@/core/cors";
import { ApiError } from "@/core/errors";
import { MongoDBService } from "@/core/mongodb";
import { CONFIG } from "@/core/config";
import { KDMHS_CONFIG } from "@/providers/kdmhs/config";
import { getCafeteriaData, refreshSpecificDate, runKdmhsRefresh, searchLatestFoodImage } from "@/providers/kdmhs/service";
import type { MealProvider } from "@/providers/types";
import type { CafeteriaData } from "@/providers/kdmhs/types";

export function createKdmhsProvider(): MealProvider {
  const config = KDMHS_CONFIG;
  const db = new MongoDBService(CONFIG.MONGODB_URI, config.dbName, config.collection);

  return {
    config,
    db,

    async init() {
      await db.connect();
      await db.createIndexes([
        { key: { documentId: 1 } },
        { key: { createdAt: 1 } },
        { key: { updatedAt: 1 } },
      ]);
    },

    async shutdown() {
      await db.disconnect();
    },

    async getMealData(date: string): Promise<CafeteriaData> {
      return getCafeteriaData(db, date);
    },

    async refreshMealData(date: string): Promise<CafeteriaData> {
      return refreshSpecificDate(db, date);
    },

    async getStats() {
      return db.getStats();
    },

    async runRefresh(type: "today" | "all") {
      return runKdmhsRefresh(db, type);
    },

    async handleExtraRoute(subPath, method, requestId, origin) {
      const searchMatch = subPath.match(/^\/search\/(.+)$/);
      if (searchMatch && method === "GET") {
        const foodName = decodeURIComponent(searchMatch[1]);
        const result = await searchLatestFoodImage(db, foodName);

        if (!result) {
          throw new ApiError(404, "해당 메뉴를 찾을 수 없어요");
        }

        return new Response(
          JSON.stringify({
            requestId,
            timestamp: new Date().toISOString(),
            foodName,
            image: result.image,
            date: result.date,
            mealType: result.mealType,
          }),
          {
            headers: {
              ...getCorsHeaders(origin),
              "Content-Type": "application/json",
            },
          },
        );
      }

      return null;
    },
  };
}
