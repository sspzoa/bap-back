import { getCorsHeaders } from '../middleware/cors';
import { ApiError } from '../middleware/error';
import { getCafeteriaData, refreshSpecificDate } from '../services/cafeteria';
import type { CafeteriaResponse, FoodSearchResponse, HealthCheckResponse } from '../types';
import { isValidDate } from '../utils/date';
import { mongoDB } from '../utils/mongodb';

export async function handleHealthCheck(requestId: string, origin: string | null = null): Promise<Response> {
  const stats = await mongoDB.getStats();

  const response: HealthCheckResponse = {
    requestId,
    timestamp: new Date().toISOString(),
    status: 'ok',
    database: {
      connected: true,
      totalMealData: stats.totalMealData,
      lastUpdated: stats.lastUpdated,
    },
  };

  return new Response(JSON.stringify(response), {
    headers: {
      ...getCorsHeaders(origin),
      'Content-Type': 'application/json',
    },
  });
}

export async function handleCafeteriaRequest(
  dateParam: string,
  requestId: string,
  origin: string | null = null,
): Promise<Response> {
  if (!isValidDate(dateParam)) {
    throw new ApiError(400, 'Invalid date format');
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
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'NO_OPERATION') {
        throw new ApiError(404, '급식 운영이 없어요');
      }
      if (error.message === 'NO_INFORMATION' || error.message.includes('not found')) {
        throw new ApiError(404, '급식 정보가 없어요');
      }
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
    throw new ApiError(400, 'Invalid date format');
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
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'NO_INFORMATION' || error.message.includes('not found')) {
        throw new ApiError(404, '급식 정보가 없어요');
      }
    }
    throw error;
  }
}

export async function handleFoodSearchRequest(
  foodName: string,
  requestId: string,
  origin: string | null = null,
): Promise<Response> {
  try {
    const latestImage = await mongoDB.searchLatestFoodImage(foodName);

    if (!latestImage) {
      throw new ApiError(404, '해당 메뉴를 찾을 수 없어요');
    }

    const response: FoodSearchResponse = {
      requestId,
      timestamp: new Date().toISOString(),
      foodName,
      image: latestImage.image,
      date: latestImage.date,
      mealType: latestImage.mealType,
    };

    return new Response(JSON.stringify(response), {
      headers: {
        ...getCorsHeaders(origin),
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    throw error;
  }
}
