import { Puppeteer, createPuppeteerCDPSession } from '@scrapeless-ai/sdk';
import { CONFIG } from '../config';
import { logger } from './logger';

let browserInstance: any = null;

async function getBrowser() {
  if (!browserInstance) {
    logger.info('Creating new browser instance');
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

async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number; solveCaptcha?: boolean } = {},
): Promise<Response> {
  const { solveCaptcha = false } = options;
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    logger.info(`Navigating to ${url}`);
    const cdpSession = await createPuppeteerCDPSession(page);
    await page.goto(url, { waitUntil: 'networkidle2' });

    if (solveCaptcha) {
      try {
        logger.info('Checking for captcha...');
        await cdpSession.waitCaptchaDetected();
        logger.info('Captcha detected, solving...');
        await cdpSession.solveCaptcha();
        await cdpSession.waitCaptchaSolved();
        logger.info('Captcha solved successfully');
        await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
      } catch {
        logger.info('No captcha detected or already solved');
      }
    }

    const content = await page.content();
    logger.info(`Successfully fetched content from ${url}`);

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
      clone: function () { return { ...this }; },
    } as Response;
  } catch (error) {
    logger.error(`Failed to fetch ${url}:`, error);
    throw new HttpError(
      500,
      `Fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
        logger.info(`Retry attempt ${attempt}/${retries} for ${url} (waiting ${delay}ms)`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const response = await fetchWithTimeout(url, { ...fetchOptions, solveCaptcha });
      return await parser(response);
    } catch (error) {
      lastError = error as Error;
      logger.warn(`Attempt ${attempt + 1}/${retries + 1} failed for ${url}`);

      if (!(error instanceof HttpError && [408, 429, 500, 502, 503, 504].includes(error.status))) {
        throw error;
      }
    }
  }

  logger.error(`All retry attempts failed for ${url}`);
  throw lastError || new Error(`Failed to fetch ${url} after ${retries + 1} attempts`);
}

export async function closeBrowser() {
  if (browserInstance) {
    logger.info('Closing browser instance');
    await browserInstance.close();
    browserInstance = null;
  }
}