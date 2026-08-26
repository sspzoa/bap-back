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
