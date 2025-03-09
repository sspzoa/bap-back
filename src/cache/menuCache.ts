import type {CacheEntry} from '../types';
import {getKSTTimestamp} from '../utils/dateUtils';

export class MenuCache {
  private static instance: MenuCache;

  private cache: Map<string, CacheEntry> = new Map();

  private readonly CACHE_DURATION = 1000 * 60 * 60 * 24;

  private constructor() {
  }

  static getInstance(): MenuCache {
    return this.instance ||= new MenuCache();
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (getKSTTimestamp() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  set(key: string, data: any): void {
    const timestamp = getKSTTimestamp();

    this.cache.set(key, {
      data,
      timestamp,
      expiresAt: timestamp + this.CACHE_DURATION
    });
  }

  clear(): void {
    this.cache.clear();
  }
}