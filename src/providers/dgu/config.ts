import type { ProviderConfig } from "@/providers/types";

export const DGU_CONFIG: ProviderConfig = {
  id: "dgu",
  name: "동국대학교 경영관 D-Flex",
  basePath: "/dgu",
  origins: ["https://dflex.xn--rh3b.net", "https://dflex.밥.net"],
  dbName: "dgu-bap",
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

export const DFLEX_WEBSITE = {
  BASE_URL: "https://www.dongguk.edu",
  LIST_PATH: "/article/FOODDFLEX/list",
  DETAIL_PATH: "/article/FOODDFLEX/detail",
  RESTAURANT_ID: "dflex",
  RESTAURANT_NAME: "경영관 D-Flex",
} as const;
