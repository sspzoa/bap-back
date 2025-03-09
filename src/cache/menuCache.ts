import type {CacheEntry} from '../types';
import { getKSTTimestamp } from '../utils/dateUtils';

/**
 * 식단 정보 캐싱을 위한 싱글턴 클래스
 * - 매 요청 시 DB나 원격 서버를 계속 조회하지 않고,
 *   일정 시간 동안은 캐시된 데이터를 사용하도록 함
 */
export class MenuCache {
  private static instance: MenuCache;

  // 실제 캐시 데이터를 저장하는 Map
  private cache: Map<string, CacheEntry> = new Map();

  // 모든 데이터에 대한 일괄 캐시 기간(24시간)
  private readonly CACHE_DURATION = 1000 * 60 * 60 * 24;

  private constructor() {
    // private 생성자로 외부에서 new 호출 불가
  }

  /**
   * 싱글턴 객체 반환
   */
  static getInstance(): MenuCache {
    return this.instance ||= new MenuCache();
  }

  /**
   * 캐시에서 데이터 가져오기
   * @param key - 일반적으로 'YYYY-MM-DD' 형태의 문자열
   */
  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // 유효 기간이 지났다면 캐시에서 삭제
    if (getKSTTimestamp() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * 캐시에 데이터 저장
   * @param key - 'YYYY-MM-DD' 형태
   * @param data - 저장할 임의의 데이터
   */
  set(key: string, data: any): void {
    const timestamp = getKSTTimestamp();

    this.cache.set(key, {
      data,
      timestamp,
      expiresAt: timestamp + this.CACHE_DURATION
    });
  }

  /**
   * 캐시 초기화
   */
  clear(): void {
    this.cache.clear();
  }
}