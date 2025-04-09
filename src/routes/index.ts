import { isValidDate } from '../utils/date';
import { logger } from '../utils/logger';
import { corsHeaders } from '../middleware/cors';
import { ApiError } from '../middleware/error';
import { cache } from '../utils/cache';
import { getCafeteriaData } from '../services/cafeteria';
import type { ApiResponse, HealthResponse, CafeteriaResponse } from '../types';

export async function handleHealthCheck(): Promise<Response> {
  const healthData: HealthResponse = {
    status: 'ok',
    cacheStatus: {
      menu_posts: cache.has('cafeteria_menu_posts')
    }
  };

  return new Response(JSON.stringify(healthData), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}

export async function handleClearCache(): Promise<Response> {
  cache.clear();

  const response: ApiResponse<{ message: string }> = {
    success: true,
    data: { message: 'Cache cleared successfully' }
  };

  return new Response(JSON.stringify(response), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}

export async function handleCafeteriaRequest(dateParam: string): Promise<Response> {
  if (!isValidDate(dateParam)) {
    throw new ApiError(400, 'Invalid date format');
  }

  try {
    const data = await getCafeteriaData(dateParam);

    const response: ApiResponse<CafeteriaResponse> = {
      success: true,
      data
    };

    return new Response(JSON.stringify(response), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        throw new ApiError(404, 'Menu not found for the specified date');
      }
    }
    throw error;
  }
}