function validateConfig() {
  const required = ["MONGODB_URI"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

export const CONFIG = {
  SERVER: {
    PORT: Number.parseInt(process.env.PORT || "3000", 10),
    HOST: process.env.HOST || "localhost",
  },
  MONGODB_URI: process.env.MONGODB_URI || "mongodb://localhost:27017",
  REFRESH_API_KEY: process.env.REFRESH_API_KEY || "",
  HTTP: {
    RETRY: {
      COUNT: 3,
      BASE_DELAY: 2000,
    },
    USE_PUPPETEER: false,
  },
} as const;

validateConfig();
