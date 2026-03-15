import { Puppeteer, createPuppeteerCDPSession } from '@scrapeless-ai/sdk';
import { CONFIG } from '../config';
import { logger } from './logger';

function normalizeFullWidthCharacters(text: string): string {
  return text
    .replace(/[\uFF01-\uFF5E]/g, (char) => 
      String.fromCharCode(char.charCodeAt(0) - 0xFEE0))
    .replace(/\u3000/g, ' ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"');
}

type BrowserInstance = Awaited<ReturnType<typeof Puppeteer.connect>>;
let browserInstance: BrowserInstance | null = null;

async function getBrowser(): Promise<BrowserInstance> {
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
  options: RequestInit & { method?: string; timeout?: number; solveCaptcha?: boolean; body?: any } = {},
): Promise<Response> {
  const { solveCaptcha = false, body } = options;
  const isPost = (options.method || 'GET').toUpperCase() === 'POST';
  const browser = await getBrowser();
  const page = await browser.newPage();
  const fetchLogger = logger.operation('fetch');

  try {
    let content: string;

    if (isPost) {
      content = await page.evaluate(
        async (fetchUrl: string, fetchBody: string, fetchHeaders: Record<string, string>) => {
          const res = await fetch(fetchUrl, {
            method: 'POST',
            body: fetchBody,
            headers: fetchHeaders,
          });
          return res.text();
        },
        url,
        (options.body as string) || '',
        (options.headers as Record<string, string>) || {},
      );
    } else {
      await page.goto(url, { waitUntil: 'networkidle2' });

      if (solveCaptcha) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cdpSession = await createPuppeteerCDPSession(page as any);
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

      content = await page.content();
    }

    const normalizedContent = normalizeFullWidthCharacters(content);

    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      url,
      json: async () => JSON.parse(normalizedContent),
      text: async () => normalizedContent,
      blob: async () => new Blob([normalizedContent]),
      arrayBuffer: async () => new TextEncoder().encode(normalizedContent).buffer,
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

async function fetchWithNative(url: string, options: RequestInit & { method?: string; timeout?: number; body?: any } = {}): Promise<Response> {
  const { timeout = 30000, ...fetchOptions } = options;
  const fetchLogger = logger.operation('fetch');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      body: options.body,
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
  options: RequestInit & { method?: string; timeout?: number; solveCaptcha?: boolean; body?: any } = {},
): Promise<Response> {
  if (CONFIG.HTTP.USE_PUPPETEER) {
    return fetchWithPuppeteer(url, options);
  }
  return fetchWithNative(url, options);
}

export async function fetchWithRetry<T>(
  url: string,
  options: RequestInit & {
    method?: string;
    timeout?: number;
    retries?: number;
    baseDelay?: number;
    solveCaptcha?: boolean;
    parser?: (response: Response) => Promise<T>;
    body?: any;
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

export { normalizeFullWidthCharacters };

export async function closeBrowser() {
  if (browserInstance) {
    logger.info('Closing browser instance');
    await browserInstance.close();
    browserInstance = null;
  }
}
