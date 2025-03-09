// utils/cache-utils.ts
interface CacheItem<T> {
  data: T;
  timestamp: number;
}

export class MemoryCache {
  private cache: Map<string, CacheItem<any>> = new Map();
  private readonly TTL: number = 24 * 60 * 60 * 1000; // 24시간 기본 TTL

  get<T>(key: string): T | undefined {
    const item = this.cache.get(key);
    if (!item) return undefined;

    const now = Date.now();
    if (now - item.timestamp > this.TTL) {
      this.cache.delete(key);
      return undefined;
    }

    return item.data;
  }

  set<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  has(key: string): boolean {
    const item = this.cache.get(key);
    if (!item) return false;

    const now = Date.now();
    if (now - item.timestamp > this.TTL) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

// 싱글톤 인스턴스
export const memoryCache = new MemoryCache();