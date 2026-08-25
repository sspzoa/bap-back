import type { ProviderConfig } from "@/providers/types";

export const HORANG_CONFIG: ProviderConfig = {
  id: "horang",
  name: "호랑에듀 구내식당",
  basePath: "/horang",
  dbName: "horang-bap",
  collection: "meal_data",
  presentation: {
    id: "horang",
    name: "호랑에듀 구내식당",
    schoolName: "메가스터디 구내식당",
    basePath: "/horang",
    description: "호랑에듀 구내식당 메뉴를 확인해보세요",
    keywords: ["구내식당", "호랑에듀", "horang-edu", "식단", "밥.net"],
    features: { foodSearch: false },
    meals: [
      {
        id: "lunch",
        title: "중식",
        operatingHours: null,
        icon: "/icon/lunch.svg",
        background: "/img/lunch.svg",
        activeUntilHour: 14,
      },
      {
        id: "dinner",
        title: "석식",
        operatingHours: null,
        icon: "/icon/dinner.svg",
        background: "/img/dinner.svg",
        activeUntilHour: 20,
      },
    ],
  },
  schedule: [
    // 주간 식단표는 보통 전주 금요일에 올라오고 거의 바뀌지 않으므로 토요일 새벽 3시에 주 1회 OCR.
    { day: 6, hour: 3, minute: 0, refreshType: "all" },
  ],
};

export const HORANG_BLOG = {
  BLOG_ID: "megafs01",
  CATEGORY_NO: 41,
  LIST_URL: "https://blog.naver.com/PostTitleListAsync.naver",
  POST_VIEW_URL: "https://m.blog.naver.com/PostView.naver",
} as const;
