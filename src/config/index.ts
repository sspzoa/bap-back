export const CONFIG = {
  SERVER: {
    PORT: Number.parseInt(process.env.PORT || '3000', 10),
    HOST: process.env.HOST || 'localhost',
  },
  CACHE: {
    TTL: 30 * 24 * 60 * 60 * 1000,
    DB_PATH: './cache.db',
    CLEANUP_INTERVAL: 30 * 24 * 60 * 60 * 1000,
  },
} as const;