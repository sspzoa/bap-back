import { corsHeaders } from '../middleware/cors';
import { ApiError } from '../middleware/error';
import { getCafeteriaData } from '../services/cafeteria';
import { mongoDB } from '../utils/mongodb';
import { isValidDate } from '../utils/date';
import { logger } from '../utils/logger';

export async function handleHealthCheck(): Promise<Response> {
  logger.info('Health check requested');
  const stats = await mongoDB.getStats();

  return new Response(JSON.stringify({
    status: 'ok',
    database: {
      connected: true,
      totalMealData: stats.totalMealData,
      lastUpdated: stats.lastUpdated,
    },
  }), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

export async function handleCafeteriaRequest(dateParam: string): Promise<Response> {
  if (!isValidDate(dateParam)) {
    logger.warn(`Invalid date format requested: ${dateParam}`);
    throw new ApiError(400, 'Invalid date format');
  }

  try {
    const data = await getCafeteriaData(dateParam);
    logger.info(`Successfully served cafeteria data for ${dateParam}`);

    return new Response(JSON.stringify(data), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'NO_OPERATION') {
        logger.info(`No operation on ${dateParam}`);
        throw new ApiError(404, '급식 운영이 없어요');
      }
      if (error.message === 'NO_INFORMATION' || error.message.includes('not found')) {
        logger.info(`No information for ${dateParam}`);
        throw new ApiError(404, '급식 정보가 없어요');
      }
    }
    throw error;
  }
}