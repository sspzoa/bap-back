export const CONFIG = {
  SERVER: {
    PORT: Number.parseInt(process.env.PORT || "3000", 10),
    HOST: process.env.HOST || "localhost",
  },
  MONGODB_URI: process.env.MONGODB_URI || "mongodb://localhost:27017",
  REFRESH_API_KEY: process.env.REFRESH_API_KEY || "",
  MINDLOGIC_KEY: process.env.MINDLOGIC_KEY || "",
  HTTP: {
    RETRY: {
      COUNT: 3,
      BASE_DELAY: 2000,
    },
  },
} as const;
