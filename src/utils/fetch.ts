import { CONFIG } from '../config';
import { logger } from './logger';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly url?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class TimeoutError extends Error {
  constructor(
    message: string,
    public readonly url?: string,
  ) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {},
): Promise<Response> {
  const { timeout = CONFIG.HTTP.TIMEOUT, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    logger.debug(`Fetching ${url}`);
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new HttpError(response.status, `Request failed with status ${response.status}`, url);
    }

    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new TimeoutError(`Request timed out after ${timeout}ms`, url);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchWithRetry<T>(
  url: string,
  options: RequestInit & {
    timeout?: number;
    retries?: number;
    baseDelay?: number;
    parser?: (response: Response) => Promise<T>;
  } = {},
): Promise<T> {
  const {
    retries = CONFIG.HTTP.RETRY.COUNT,
    baseDelay = CONFIG.HTTP.RETRY.BASE_DELAY,
    parser = (response) => response.json() as Promise<T>,
    ...fetchOptions
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = baseDelay * 2 ** (attempt - 1);
        logger.info(`Retry attempt ${attempt}/${retries} for ${url} after ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const response = await fetchWithTimeout(url, fetchOptions);
      return await parser(response);
    } catch (error) {
      logger.warn(`Attempt ${attempt + 1}/${retries + 1} failed for ${url}:`, error);
      lastError = error as Error;

      if (
        !(error instanceof TimeoutError) &&
        !(error instanceof HttpError && [408, 429, 500, 502, 503, 504].includes(error.status))
      ) {
        throw error;
      }
    }
  }

  throw lastError || new Error(`Failed to fetch ${url} after ${retries + 1} attempts`);
}
