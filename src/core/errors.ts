import { getCorsHeaders } from "@/core/cors";
import { logger } from "@/core/logger";
import { MEAL_ERROR_MESSAGES } from "@/core/mealErrors";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class MealNotFoundError extends ApiError {
  constructor(message = MEAL_ERROR_MESSAGES.noMealData) {
    super(404, message);
    this.name = "MealNotFoundError";
  }
}

export class MealNoOperationError extends ApiError {
  constructor(message = MEAL_ERROR_MESSAGES.noMealOperation) {
    super(404, message);
    this.name = "MealNoOperationError";
  }
}

export function handleError(error: unknown, requestId?: string, origin: string | null = null): Response {
  logger.error("Request error:", error);

  const errorResponse = {
    requestId: requestId || "unknown",
    timestamp: new Date().toISOString(),
    error: error instanceof ApiError ? error.message : "Internal server error",
  };

  const status = error instanceof ApiError ? error.status : 500;

  return new Response(JSON.stringify(errorResponse), {
    status,
    headers: {
      ...getCorsHeaders(origin),
      "Content-Type": "application/json",
    },
  });
}
