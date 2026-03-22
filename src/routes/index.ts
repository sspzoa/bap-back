import { getCorsHeaders } from "@/middleware/cors";
import { ApiError, MealNoOperationError, MealNotFoundError } from "@/middleware/error";
import { getCafeteriaData, refreshSpecificDate } from "@/services/cafeteria";
import { mongoDB } from "@/shared/lib/mongodb";
import type { CafeteriaResponse, FoodSearchResponse, HealthCheckResponse } from "@/shared/types";
import { isValidDate } from "@/shared/utils/date";

export async function handleHealthCheck(requestId: string, origin: string | null = null): Promise<Response> {
  const stats = await mongoDB.getStats();

  const response: HealthCheckResponse = {
    requestId,
    timestamp: new Date().toISOString(),
    status: "ok",
    database: {
      connected: true,
      totalMealData: stats.totalMealData,
      lastUpdated: stats.lastUpdated,
    },
  };

  return new Response(JSON.stringify(response), {
    headers: {
      ...getCorsHeaders(origin),
      "Content-Type": "application/json",
    },
  });
}

export async function handleCafeteriaRequest(
  dateParam: string,
  requestId: string,
  origin: string | null = null,
): Promise<Response> {
  if (!isValidDate(dateParam)) {
    throw new ApiError(400, "Invalid date format");
  }

  try {
    const data = await getCafeteriaData(dateParam);

    const response: CafeteriaResponse = {
      requestId,
      timestamp: new Date().toISOString(),
      date: dateParam,
      data,
    };

    return new Response(JSON.stringify(response), {
      headers: {
        ...getCorsHeaders(origin),
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    if (error instanceof MealNoOperationError) {
      throw new ApiError(404, error.message);
    }
    if (error instanceof MealNotFoundError) {
      throw new ApiError(404, error.message);
    }
    throw error;
  }
}

export async function handleRefreshRequest(
  dateParam: string,
  requestId: string,
  origin: string | null = null,
): Promise<Response> {
  if (!isValidDate(dateParam)) {
    throw new ApiError(400, "Invalid date format");
  }

  try {
    const data = await refreshSpecificDate(dateParam);

    const response: CafeteriaResponse = {
      requestId,
      timestamp: new Date().toISOString(),
      date: dateParam,
      data,
    };

    return new Response(JSON.stringify(response), {
      headers: {
        ...getCorsHeaders(origin),
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    if (error instanceof MealNotFoundError) {
      throw new ApiError(404, error.message);
    }
    throw error;
  }
}

export async function handleFoodSearchRequest(
  foodName: string,
  requestId: string,
  origin: string | null = null,
): Promise<Response> {
  const result = await mongoDB.searchLatestFoodImage(foodName);

  if (!result) {
    throw new ApiError(404, "해당 메뉴를 찾을 수 없어요");
  }

  const response: FoodSearchResponse = {
    requestId,
    timestamp: new Date().toISOString(),
    foodName,
    image: result.image,
    date: result.date,
    mealType: result.mealType,
  };

  return new Response(JSON.stringify(response), {
    headers: {
      ...getCorsHeaders(origin),
      "Content-Type": "application/json",
    },
  });
}
