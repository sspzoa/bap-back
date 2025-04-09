import { corsHeaders } from './cors';
import { logger } from '../utils/logger';
import type { ApiResponse } from '../types';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function handleError(error: unknown): Response {
  logger.error('Error handling request:', error);

  if (error instanceof ApiError) {
    const body: ApiResponse = {
      success: false,
      error: error.message
    };

    return new Response(JSON.stringify(body), {
      status: error.status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }

  const body: ApiResponse = {
    success: false,
    error: 'Internal server error'
  };

  return new Response(JSON.stringify(body), {
    status: 500,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}