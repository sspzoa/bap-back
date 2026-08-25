export const CONFIG = {
  SERVER: {
    PORT: Number.parseInt(process.env.PORT || "3000", 10),
    HOST: process.env.HOST || "localhost",
  },
  MONGODB_URI: process.env.MONGODB_URI || "mongodb://localhost:27017",
  MINDLOGIC_KEY: process.env.MINDLOGIC_KEY || "",
  PUBLIC_API_URL: process.env.PUBLIC_API_URL || "https://api.밥.net",
  HTTP: {
    RETRY: {
      COUNT: 3,
      BASE_DELAY: 2000,
    },
  },
} as const;
