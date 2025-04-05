import { Database } from 'bun:sqlite';

class SQLiteCache {
  private db: Database;
  private readonly TTL: number = 24 * 60 * 60 * 1000;

  constructor(dbPath: string = './cache.db') {
    this.db = new Database(dbPath);
    this.init();
  }

  private init() {
    this.db.run(`
        CREATE TABLE IF NOT EXISTS cache (
                                             key TEXT PRIMARY KEY,
                                             value TEXT NOT NULL,
                                             timestamp INTEGER NOT NULL
        )
    `);

    setInterval(() => this.cleanup(), 60 * 60 * 1000);
  }

  private cleanup() {
    const now = Date.now();
    this.db.run('DELETE FROM cache WHERE timestamp + ? < ?', [this.TTL, now]);
  }

  get<T>(key: string): T | undefined {
    const now = Date.now();
    const stmt = this.db.prepare('SELECT value, timestamp FROM cache WHERE key = ?');
    const row = stmt.get(key) as { value: string; timestamp: number } | null;

    if (!row) return undefined;

    if (now - row.timestamp > this.TTL) {
      this.delete(key);
      return undefined;
    }

    try {
      return JSON.parse(row.value) as T;
    } catch (error) {
      console.error(`Error parsing cache value for key ${key}:`, error);
      return undefined;
    }
  }

  set<T>(key: string, data: T): void {
    const value = JSON.stringify(data);
    const timestamp = Date.now();

    const stmt = this.db.prepare('INSERT OR REPLACE INTO cache (key, value, timestamp) VALUES (?, ?, ?)');
    stmt.run(key, value, timestamp);
  }

  has(key: string): boolean {
    const now = Date.now();
    const stmt = this.db.prepare('SELECT timestamp FROM cache WHERE key = ?');
    const row = stmt.get(key) as { timestamp: number } | null;

    if (!row) return false;

    if (now - row.timestamp > this.TTL) {
      this.delete(key);
      return false;
    }

    return true;
  }

  delete(key: string): void {
    const stmt = this.db.prepare('DELETE FROM cache WHERE key = ?');
    stmt.run(key);
  }

  clear(): void {
    this.db.run('DELETE FROM cache');
  }

  getAllKeys(): string[] {
    const stmt = this.db.prepare('SELECT key FROM cache');
    const rows = stmt.all() as Array<{key: string}>;
    return rows.map(row => row.key);
  }

  close(): void {
    this.db.close();
  }
}

export const sqliteCache = new SQLiteCache();