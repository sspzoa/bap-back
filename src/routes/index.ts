import { isValidDate } from '../utils/date';
import { corsHeaders } from '../middleware/cors';
import { ApiError } from '../middleware/error';
import { cache } from '../utils/cache';
import { getCafeteriaData } from '../services/cafeteria';

export async function handleHealthCheck(): Promise<Response> {
  const healthData = {
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

  return new Response(JSON.stringify({ success: true, message: 'Cache cleared successfully' }), {
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

    return new Response(JSON.stringify(data), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'NO_OPERATION') {
        throw new ApiError(404, '급식 운영이 없어요');
      } else if (error.message === 'NO_INFORMATION' || error.message.includes('not found')) {
        throw new ApiError(404, '급식 정보가 없어요');
      }
    }
    throw error;
  }
}