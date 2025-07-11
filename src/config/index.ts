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
  },
} as const;

validateConfig();
