import type { ProviderConfig } from "@/providers/types";

export const DGU_CONFIG: ProviderConfig = {
  id: "dgu",
  name: "동국대학교",
  basePath: "/dgu",
  origins: ["https://xn--3o2bl7m86e.xn--rh3b.net", "https://상록원.밥.net"],
  dbName: process.env.DGU_MONGODB_DB_NAME || "dgu-bap",
  collection: "meal_data",
  schedule: [
    { day: 0, hour: 3, minute: 0, refreshType: "all" },
    { day: 0, hour: 10, minute: 30, refreshType: "today" },
    { day: 1, hour: 3, minute: 0, refreshType: "all" },
    { day: 1, hour: 10, minute: 30, refreshType: "today" },
    { day: 1, hour: 16, minute: 0, refreshType: "today" },
    { day: 2, hour: 3, minute: 0, refreshType: "all" },
    { day: 2, hour: 10, minute: 30, refreshType: "today" },
    { day: 2, hour: 16, minute: 0, refreshType: "today" },
    { day: 3, hour: 3, minute: 0, refreshType: "all" },
    { day: 3, hour: 10, minute: 30, refreshType: "today" },
    { day: 3, hour: 16, minute: 0, refreshType: "today" },
    { day: 4, hour: 3, minute: 0, refreshType: "all" },
    { day: 4, hour: 10, minute: 30, refreshType: "today" },
    { day: 4, hour: 16, minute: 0, refreshType: "today" },
    { day: 5, hour: 3, minute: 0, refreshType: "all" },
    { day: 5, hour: 10, minute: 30, refreshType: "today" },
    { day: 5, hour: 16, minute: 0, refreshType: "today" },
    { day: 6, hour: 3, minute: 0, refreshType: "all" },
    { day: 6, hour: 10, minute: 30, refreshType: "today" },
  ],
};

export const DGU_WEBSITE = {
  BASE_URL: "https://dgucoop.dongguk.edu/mobile",
  RESTAURANTS: [
    { id: "1F", name: "1층", code: 7 },
    { id: "2F", name: "2층", code: 1 },
    { id: "3F", name: "3층", code: 5 },
  ],
} as const;
