import { corsHeaders } from '../middleware/cors';
import { ApiError } from '../middleware/error';
import { getCafeteriaData } from '../services/cafeteria';
import { mongoDB } from '../utils/mongodb';
import { isValidDate } from '../utils/date';

export async function handleHealthCheck(): Promise<Response> {
  const stats = await mongoDB.getStats();

  const healthData = {
    status: 'ok',
    database: {
      connected: true,
      totalMealData: stats.totalMealData,
      lastUpdated: stats.lastUpdated,
    },
  };

  return new Response(JSON.stringify(healthData), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

export async function handleClearCache(): Promise<Response> {
  const stats = await mongoDB.getStats();

  return new Response(JSON.stringify({
    success: true,
    message: 'MongoDB storage is persistent. No cache to clear.',
    stats
  }), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

export async function handleCafeteriaRequest(dateParam: string): Promise<Response> {
  if (!isValidDate(dateParam)) {
    throw new ApiError(400, 'Invalid date format');
  }

  try {
    const data = await getCafeteriaData(dateParam);

    return new Response(JSON.stringify(data), {
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