import { logger } from '../utils/logger';
import { getCorsHeaders } from './cors';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function handleError(error: unknown, requestId?: string, origin: string | null = null): Response {
  logger.error('Request error:', error);

  const errorResponse = {
    requestId: requestId || 'unknown',
    timestamp: new Date().toISOString(),
    error: error instanceof ApiError ? error.message : 'Internal server error',
  };

  const status = error instanceof ApiError ? error.status : 500;

  return new Response(JSON.stringify(errorResponse), {
    status,
    headers: {
      ...getCorsHeaders(origin),
      'Content-Type': 'application/json',
    },
  });
}
