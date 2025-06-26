import { Database } from 'bun:sqlite';
import { CONFIG } from '../config';
import { logger } from './logger';

export class Cache {
  private db: Database;
  private readonly ttl: number;

  constructor(
    options: {
      dbPath?: string;
      ttl?: number;
      cleanupInterval?: number;
    } = {},
  ) {
    const {
      dbPath = CONFIG.CACHE.DB_PATH,
      ttl = CONFIG.CACHE.TTL,
      cleanupInterval = CONFIG.CACHE.CLEANUP_INTERVAL,
    } = options;

    this.ttl = ttl;
    this.db = new Database(dbPath);
    this.initialize();

    setInterval(() => this.cleanup(), cleanupInterval);
  }

  private initialize(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )
    `);

    logger.info('Cache initialized');
  }

  private cleanup(): void {
    const now = Date.now();
    const result = this.db.run('DELETE FROM cache WHERE expires_at < ?', [now]);
    if (result.changes > 0) {
      logger.debug(`Cleaned up ${result.changes} expired cache entries`);
    }
  }

  get<T>(key: string): T | undefined {
    const now = Date.now();
    const stmt = this.db.prepare('SELECT value, expires_at FROM cache WHERE key = ? AND expires_at > ?');
    const row = stmt.get(key, now) as { value: string; expires_at: number } | null;

    if (!row) return undefined;

    try {
      return JSON.parse(row.value) as T;
    } catch (error) {
      logger.error(`Error parsing cache value for key ${key}:`, error);
      this.delete(key);
      return undefined;
    }
  }

  set<T>(key: string, data: T, customTtl?: number): void {
    const value = JSON.stringify(data);
    const timestamp = Date.now();
    const expiresAt = timestamp + (customTtl || this.ttl);

    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO cache (key, value, timestamp, expires_at) VALUES (?, ?, ?, ?)',
    );
    stmt.run(key, value, timestamp, expiresAt);
  }

  has(key: string): boolean {
    const now = Date.now();
    const stmt = this.db.prepare('SELECT 1 FROM cache WHERE key = ? AND expires_at > ?');
    const exists = stmt.get(key, now) !== null;
    return exists;
  }

  delete(key: string): void {
    const stmt = this.db.prepare('DELETE FROM cache WHERE key = ?');
    stmt.run(key);
  }

  clear(): void {
    const result = this.db.run('DELETE FROM cache');
    logger.info(`Cleared ${result.changes} cache entries`);
  }

  close(): void {
    this.db.close();
    logger.info('Cache database connection closed');
  }
}

export const cache = new Cache();
