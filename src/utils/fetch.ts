import { CONFIG } from "@/core/config";
import { logger } from "@/core/logger";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly url?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

async function fetchWithNative(
  url: string,
  options: RequestInit & { method?: string; timeout?: number; body?: any } = {},
): Promise<Response> {
  const { timeout = 30000, ...fetchOptions } = options;
  const fetchLogger = logger.operation("fetch");
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: options.body,
      ...fetchOptions,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new HttpError(response.status, `HTTP ${response.status}: ${response.statusText}`, url);
    }

    return response;
  } catch (error) {
    fetchLogger.error(`Fetch failed: ${url}`, error);
    if (error instanceof HttpError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new HttpError(408, "Request timeout", url);
    }
    throw new HttpError(500, `Fetch failed: ${error instanceof Error ? error.message : "Unknown error"}`, url);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export async function fetchWithRetry<T>(
  url: string,
  options: RequestInit & {
    method?: string;
    timeout?: number;
    retries?: number;
    baseDelay?: number;
    parser?: (response: Response) => Promise<T>;
    body?: any;
  } = {},
): Promise<T> {
  const {
    retries = CONFIG.HTTP.RETRY.COUNT,
    baseDelay = CONFIG.HTTP.RETRY.BASE_DELAY,
    parser = (response) => response.json() as Promise<T>,
    ...fetchOptions
  } = options;

  const retryLogger = logger.operation("fetch-retry");
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = baseDelay * 2 ** (attempt - 1);
        retryLogger.warn(`Retry ${attempt}/${retries} after ${delay}ms`, { url });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const response = await fetchWithNative(url, fetchOptions);
      return await parser(response);
    } catch (error) {
      lastError = error as Error;

      if (!(error instanceof HttpError && [408, 429, 500, 502, 503, 504].includes(error.status))) {
        throw error;
      }
    }
  }

  retryLogger.error(`All retries failed for ${url}`);
  throw lastError || new Error(`Failed to fetch ${url} after ${retries + 1} attempts`);
}
