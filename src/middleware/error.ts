import { logger } from '../utils/logger';
import { corsHeaders } from './cors';

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

export function handleError(error: unknown): Response {
  logger.error('Request error:', error);

  const errorResponse = {
    error: error instanceof ApiError ? error.message : 'Internal server error',
  };

  const status = error instanceof ApiError ? error.status : 500;

  return new Response(JSON.stringify(errorResponse), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}