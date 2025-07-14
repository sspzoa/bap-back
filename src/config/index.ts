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
      { day: 0, hour: 7 },
      { day: 0, hour: 12 },
      { day: 0, hour: 18 },
      { day: 1, hour: 7 },
      { day: 1, hour: 12 },
      { day: 1, hour: 18 },
      { day: 2, hour: 7 },
      { day: 2, hour: 12 },
      { day: 2, hour: 18 },
      { day: 3, hour: 7 },
      { day: 3, hour: 12 },
      { day: 3, hour: 18 },
      { day: 4, hour: 7 },
      { day: 4, hour: 12 },
      { day: 4, hour: 18 },
      { day: 5, hour: 7 },
      { day: 5, hour: 12 },
      { day: 5, hour: 18 },
      { day: 6, hour: 3 },
      { day: 6, hour: 7 },
      { day: 6, hour: 12 },
      { day: 6, hour: 18 },
    ],
  },
} as const;

validateConfig();
