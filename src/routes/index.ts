import { corsHeaders } from '../middleware/cors';
import { ApiError } from '../middleware/error';
import { getCafeteriaData } from '../services/cafeteria';
import type { CafeteriaResponse, HealthCheckResponse } from '../types';
import { isValidDate } from '../utils/date';
import { mongoDB } from '../utils/mongodb';

export async function handleHealthCheck(requestId: string): Promise<Response> {
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
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

export async function handleCafeteriaRequest(dateParam: string, requestId: string): Promise<Response> {
  if (!isValidDate(dateParam)) {
    throw new ApiError(400, 'Invalid date format');
  }

  try {
    const data = await getCafeteriaData(dateParam);

    const response: CafeteriaResponse = {
      requestId,
      requestedDate: dateParam,
      timestamp: new Date().toISOString(),
      data,
    };

    return new Response(JSON.stringify(response), {
      headers: {
        ...corsHeaders,
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
