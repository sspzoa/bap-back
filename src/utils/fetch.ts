import { Puppeteer, createPuppeteerCDPSession } from '@scrapeless-ai/sdk';
import { CONFIG } from '../config';
import { logger } from './logger';

let browserInstance: any = null;

async function getBrowser() {
  if (!browserInstance) {
    browserInstance = await Puppeteer.connect({
      apiKey: process.env.SCRAPELESS_API_KEY,
      session_name: 'fetchWithPuppeteer',
      session_ttl: 10000,
      proxy_country: 'ANY',
      session_recording: true,
      defaultViewport: null
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
  options: RequestInit & { timeout?: number; solveCaptcha?: boolean } = {},
): Promise<Response> {
  const { solveCaptcha = false, ...fetchOptions } = options;
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    logger.debug(`Fetching with Puppeteer: ${url}`);

    const cdpSession = await createPuppeteerCDPSession(page);

    await page.goto(url, { waitUntil: 'networkidle2' });

    if (solveCaptcha) {
      try {
        logger.info('캡챠 감지 확인 중...');
        await cdpSession.waitCaptchaDetected();

        logger.info('캡챠가 감지되었습니다. 해결 중...');
        await cdpSession.solveCaptcha();

        await cdpSession.waitCaptchaSolved();
        logger.info('캡챠가 해결되었습니다.');

        await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
      } catch (error) {
        logger.info('캡챠가 감지되지 않았거나 이미 해결되었습니다.');
      }
    }

    const content = await page.content();
    const status = 200;

    return {
      ok: true,
      status,
      statusText: 'OK',
      headers: new Headers(),
      url,
      json: async () => {
        try {
          return JSON.parse(content);
        } catch {
          throw new Error('Response is not valid JSON');
        }
      },
      text: async () => content,
      blob: async () => new Blob([content]),
      arrayBuffer: async () => new TextEncoder().encode(content).buffer,
      clone: function () {
        return { ...this };
      },
    } as Response;
  } catch (error) {
    throw new HttpError(
      500,
      `Puppeteer fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      url,
    );
  } finally {
    await page.close();
  }
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

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = baseDelay * 2 ** (attempt - 1);
        logger.info(`Retry attempt ${attempt}/${retries} for ${url} after ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const response = await fetchWithTimeout(url, { ...fetchOptions, solveCaptcha });
      return await parser(response);
    } catch (error) {
      logger.warn(`Attempt ${attempt + 1}/${retries + 1} failed for ${url}:`, error);
      lastError = error as Error;

      if (!(error instanceof HttpError && [408, 429, 500, 502, 503, 504].includes(error.status))) {
        throw error;
      }
    }
  }

  throw lastError || new Error(`Failed to fetch ${url} after ${retries + 1} attempts`);
}

export async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}
