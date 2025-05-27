export const CONFIG = {
  SERVER: {
    PORT: Number.parseInt(process.env.PORT || '3000', 10),
    HOST: process.env.HOST || 'localhost',
  },
  WEBSITE: {
    BASE_URL: 'https://www.dimigo.hs.kr/index.php',
    CAFETERIA_PATH: 'school_cafeteria',
  },
  MEAL_TYPES: {
    BREAKFAST: '조식',
    LUNCH: '중식',
    DINNER: '석식',
  },
  CACHE: {
    TTL: 24 * 60 * 60 * 1000,
    DB_PATH: './cache.db',
    CLEANUP_INTERVAL: 60 * 60 * 1000,
  },
  HTTP: {
    TIMEOUT: 5000,
    RETRY: {
      COUNT: 3,
      BASE_DELAY: 2000,
    },
  },
  CRON: {
    REFRESH_INTERVAL: 5 * 60 * 1000,
  },
} as const;
