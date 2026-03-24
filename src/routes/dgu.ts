import { getCorsHeaders } from "@/middleware/cors";
import { ApiError, MealNotFoundError } from "@/middleware/error";
import { getDguCafeteriaData, refreshDguCafeteriaData } from "@/services/dgu";
import { dguMongoDB } from "@/shared/lib/mongodb";
import type { DguCafeteriaResponse, HealthCheckResponse } from "@/shared/types";
import { isValidDate } from "@/shared/utils/date";

export async function handleDguHealthCheck(requestId: string, origin: string | null = null): Promise<Response> {
  const stats = await dguMongoDB.getStats();

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

export async function handleDguCafeteriaRequest(
  dateParam: string,
  requestId: string,
  origin: string | null = null,
): Promise<Response> {
  if (!isValidDate(dateParam)) {
    throw new ApiError(400, "Invalid date format");
  }

  try {
    const data = await getDguCafeteriaData(dateParam);

    const response: DguCafeteriaResponse = {
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

export async function handleDguRefreshRequest(
  dateParam: string,
  requestId: string,
  origin: string | null = null,
): Promise<Response> {
  if (!isValidDate(dateParam)) {
    throw new ApiError(400, "Invalid date format");
  }

  try {
    const data = await refreshDguCafeteriaData(dateParam);

    const response: DguCafeteriaResponse = {
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
