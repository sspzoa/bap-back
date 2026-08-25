import type { ProviderConfig } from "@/providers/types";

export const MEGA_CONFIG: ProviderConfig = {
  id: "mega",
  name: "메가스터디 구내식당",
  basePath: "/mega",
  dbName: "mega-bap",
  collection: "meal_data",
  schedule: [
    // 주간 식단표는 보통 전주 금요일에 올라오고 거의 바뀌지 않으므로 토요일 새벽 3시에 주 1회 OCR.
    { day: 6, hour: 3, minute: 0, refreshType: "all" },
  ],
};

export const MEGA_BLOG = {
  BLOG_ID: "megafs01",
  CATEGORY_NO: 41,
  LIST_URL: "https://blog.naver.com/PostTitleListAsync.naver",
  POST_VIEW_URL: "https://m.blog.naver.com/PostView.naver",
} as const;
