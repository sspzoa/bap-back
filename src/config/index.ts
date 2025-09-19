function validateConfig() {
  const required = ['MONGODB_URI'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

export const CONFIG = {
  SERVER: {
    PORT: Number.parseInt(process.env.PORT || '3000', 10),
    HOST: process.env.HOST || 'localhost',
  },
  WEBSITE: {
    BASE_URL: 'https://www.dimigo.hs.kr/index.php',
    CAFETERIA_PATH: 'school_cafeteria',
    PAGE_RANGE: {
      START: 1,
      END: 1,
    },
  },
  MEAL_TYPES: {
    BREAKFAST: '조식',
    LUNCH: '중식',
    DINNER: '석식',
  },
  MONGODB: {
    URI: process.env.MONGODB_URI || 'mongodb://localhost:27017',
    DB_NAME: process.env.MONGODB_DB_NAME || 'mongo_db_name',
    COLLECTION: 'meal_data',
  },
  HTTP: {
    RETRY: {
      COUNT: 3,
      BASE_DELAY: 2000,
    },
    USE_PUPPETEER: false,
  },
  REFRESH: {
    SCHEDULE: [
      // 주말 (일요일)
      { day: 0, hour: 7, minute: 0, refreshType: 'today' },
      { day: 0, hour: 12, minute: 0, refreshType: 'today' },
      { day: 0, hour: 18, minute: 0, refreshType: 'today' },
      // 평일 (월요일)
      { day: 1, hour: 6, minute: 30, refreshType: 'today' },
      { day: 1, hour: 12, minute: 50, refreshType: 'today' },
      { day: 1, hour: 18, minute: 30, refreshType: 'today' },
      // 평일 (화요일)
      { day: 2, hour: 6, minute: 30, refreshType: 'today' },
      { day: 2, hour: 12, minute: 50, refreshType: 'today' },
      { day: 2, hour: 18, minute: 30, refreshType: 'today' },
      // 평일 (수요일)
      { day: 3, hour: 6, minute: 30, refreshType: 'today' },
      { day: 3, hour: 12, minute: 50, refreshType: 'today' },
      { day: 3, hour: 18, minute: 30, refreshType: 'today' },
      // 평일 (목요일)
      { day: 4, hour: 6, minute: 30, refreshType: 'today' },
      { day: 4, hour: 12, minute: 50, refreshType: 'today' },
      { day: 4, hour: 18, minute: 30, refreshType: 'today' },
      // 평일 (금요일)
      { day: 5, hour: 6, minute: 30, refreshType: 'today' },
      { day: 5, hour: 12, minute: 50, refreshType: 'today' },
      { day: 5, hour: 18, minute: 30, refreshType: 'today' },
      // 주말 (토요일)
      { day: 6, hour: 3, minute: 0, refreshType: 'all' },
      { day: 6, hour: 7, minute: 0, refreshType: 'today' },
      { day: 6, hour: 12, minute: 0, refreshType: 'today' },
      { day: 6, hour: 18, minute: 0, refreshType: 'today' }
    ],
  },
} as const;

validateConfig();
