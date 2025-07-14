import { Puppeteer, createPuppeteerCDPSession } from '@scrapeless-ai/sdk';
import { CONFIG } from '../config';
import { logger } from './logger';

let browserInstance: import('puppeteer-core').Browser | null = null;

async function getBrowser() {
  if (!browserInstance) {
    logger.info('Creating browser instance');
    browserInstance = await Puppeteer.connect({
      apiKey: process.env.SCRAPELESS_API_KEY,
      session_name: 'fetchWithPuppeteer',
      session_ttl: 10000,
      proxy_country: 'ANY',
      session_recording: true,
      defaultViewport: null,
    });
  }
  return browserInstance;
}

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

async function fetchWithPuppeteer(
  url: string,
  options: RequestInit & { timeout?: number; solveCaptcha?: boolean } = {},
): Promise<Response> {
  const { solveCaptcha = false } = options;
  const browser = await getBrowser();
  const page = await browser.newPage();
  const fetchLogger = logger.operation('fetch');

  try {
    await page.goto(url, { waitUntil: 'networkidle2' });

    if (solveCaptcha) {
      try {
        const cdpSession = await createPuppeteerCDPSession(page);
        await cdpSession.waitCaptchaDetected();
        fetchLogger.info('Solving captcha');
        await cdpSession.solveCaptcha();
        await cdpSession.waitCaptchaSolved();
        fetchLogger.info('Captcha solved');
        await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
      } catch {
        // No captcha detected
      }
    }

    const content = await page.content();

    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      url,
      json: async () => JSON.parse(content),
      text: async () => content,
      blob: async () => new Blob([content]),
      arrayBuffer: async () => new TextEncoder().encode(content).buffer,
      clone: function () {
        return { ...this };
      },
    } as Response;
  } catch (error) {
    fetchLogger.error(`Fetch failed: ${url}`, error);
    throw new HttpError(500, `Fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`, url);
  } finally {
    await page.close();
  }
}

async function fetchWithNative(url: string, options: RequestInit & { timeout?: number } = {}): Promise<Response> {
  const { timeout = 30000, ...fetchOptions } = options;
  const fetchLogger = logger.operation('fetch');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new HttpError(response.status, `HTTP ${response.status}: ${response.statusText}`, url);
    }

    return response;
  } catch (error) {
    fetchLogger.error(`Fetch failed: ${url}`, error);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new HttpError(408, 'Request timeout', url);
    }
    throw new HttpError(500, `Fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`, url);
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number; solveCaptcha?: boolean } = {},
): Promise<Response> {
  if (CONFIG.HTTP.USE_PUPPETEER) {
    return fetchWithPuppeteer(url, options);
  }
  return fetchWithNative(url, options);
}

export async function fetchWithRetry<T>(
  url: string,
  options: RequestInit & {
    timeout?: number;
    retries?: number;
    baseDelay?: number;
    solveCaptcha?: boolean;
    parser?: (response: Response) => Promise<T>;
  } = {},
): Promise<T> {
  const {
    retries = CONFIG.HTTP.RETRY.COUNT,
    baseDelay = CONFIG.HTTP.RETRY.BASE_DELAY,
    solveCaptcha = false,
    parser = (response) => response.json() as Promise<T>,
    ...fetchOptions
  } = options;

  const retryLogger = logger.operation('fetch-retry');
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = baseDelay * 2 ** (attempt - 1);
        retryLogger.warn(`Retry ${attempt}/${retries} after ${delay}ms`, { url });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const response = await fetchWithTimeout(url, {
        ...fetchOptions,
        solveCaptcha: CONFIG.HTTP.USE_PUPPETEER ? solveCaptcha : false,
      });
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

export async function closeBrowser() {
  if (browserInstance) {
    logger.info('Closing browser instance');
    await browserInstance.close();
    browserInstance = null;
  }
}
