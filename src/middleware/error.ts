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
  logger.error('Error handling request:', error);

  if (error instanceof ApiError) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  }

  return new Response(JSON.stringify({ error: 'Internal server error' }), {
    status: 500,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}
