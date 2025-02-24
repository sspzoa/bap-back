import { CONFIG } from '../config';

/**
 * fetch에 타임아웃 기능을 추가한 유틸 함수
 * @param resource - 요청 URL
 * @param options - fetch 옵션
 * @throws AbortError - 타임아웃 시 AbortController를 통해 abort
 */
export async function fetchWithTimeout(resource: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);

  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}
