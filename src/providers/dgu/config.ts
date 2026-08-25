import type { ProviderConfig } from "@/providers/types";

export const DGU_CONFIG: ProviderConfig = {
  id: "dgu",
  name: "동국대학교 경영관 D-Flex",
  basePath: "/dgu",
  dbName: "dgu-bap",
  collection: "meal_data",
  presentation: {
    id: "dgu",
    name: "D-Flex 학식",
    schoolName: "동국대학교 경영관 D-Flex",
    basePath: "/dgu",
    description: "D-Flex 학식을 확인해보세요",
    keywords: ["학식", "동국대", "D-Flex", "경영관", "식단", "밥.net"],
    features: { foodSearch: false },
    meals: [
      {
        id: "lunch",
        title: "중식",
        operatingHours: "11:30~14:00",
        icon: "/icon/lunch.svg",
        background: "/img/lunch.svg",
        activeUntilHour: 14,
      },
      {
        id: "dinner",
        title: "석식",
        operatingHours: "17:00~19:00",
        icon: "/icon/dinner.svg",
        background: "/img/dinner.svg",
        activeUntilHour: 20,
      },
    ],
  },
  schedule: [
    // 주간 식단표는 한 번 게시되면 거의 바뀌지 않으므로 토요일 새벽 3시에 주 1회만 전체 OCR.
    { day: 6, hour: 3, minute: 0, refreshType: "all" },
  ],
};

export const DFLEX_WEBSITE = {
  BASE_URL: "https://www.dongguk.edu",
  LIST_PATH: "/article/FOODDFLEX/list",
  DETAIL_PATH: "/article/FOODDFLEX/detail",
} as const;
