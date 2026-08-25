import { MEAL_ERROR_MESSAGES } from "@/core/mealErrors";
import type { ApiDocsEndpoint, ApiDocsField, ApiDocsPayload, SitePresentation } from "@/core/types";

const PUBLIC_MEAL_FIELDS: ApiDocsField[] = [
  { name: "id", type: "string", description: "슬롯 id (breakfast, lunch, …)" },
  { name: "title", type: "string", description: "표시 이름 (아침, 중식, …)" },
  { name: "operatingHours", type: "string | null", description: "운영 시간" },
  { name: "kcal", type: "number | null", description: "kdmhs 등에서 칼로리" },
  { name: "image", type: "string | null", description: "끼니 대표 사진 URL" },
  { name: "groups", type: "PublicMenuGroup[]", description: "코너·플러스바 등 메뉴 묶음" },
];

const PUBLIC_MENU_GROUP_FIELDS: ApiDocsField[] = [
  { name: "id", type: "string", description: "regular · plus · simple 또는 코너 이름" },
  { name: "label", type: "string | null", description: "플러스바, 코너 표시명" },
  { name: "price", type: "string | null", description: "가격 (콤마 포함 문자열)" },
  { name: "items", type: "string[]", description: "메뉴 항목" },
];

const ERROR_ROWS: ApiDocsField[] = [
  { name: "400", type: "Invalid date format", description: "날짜 형식이 YYYY-MM-DD 가 아님" },
  { name: "404", type: "Endpoint not found", description: "경로 없음" },
  {
    name: "404",
    type: MEAL_ERROR_MESSAGES.noMealData,
    description: "Mongo에 저장된 날짜 범위 밖",
  },
  {
    name: "404",
    type: MEAL_ERROR_MESSAGES.noMealOperation,
    description: "범위 안이지만 해당 날짜 데이터 없음",
  },
  { name: "500", type: "Internal server error", description: "예상치 못한 서버 오류" },
];

export function buildApiDocs(
  providers: SitePresentation[],
  baseUrl: string,
  exampleDate: string,
): ApiDocsPayload {
  const searchProvider = providers.find((site) => site.features.foodSearch);
  const cafeteriaProvider = providers.find((site) => site.basePath === "/kdmhs") ?? providers[0];
  const cornerProvider =
    providers.find((site) => site.basePath === "/dgu") ?? providers.find((site) => site.id !== "kdmhs");

  const mealCurls: string[] = [];
  if (cafeteriaProvider) {
    mealCurls.push(`curl ${baseUrl}${cafeteriaProvider.basePath}/${exampleDate}`);
  }
  if (cornerProvider && cornerProvider.basePath !== cafeteriaProvider?.basePath) {
    mealCurls.push(`curl ${baseUrl}${cornerProvider.basePath}/${exampleDate}`);
  }

  const searchCurls: string[] = [];
  if (searchProvider) {
    searchCurls.push(`curl ${baseUrl}${searchProvider.basePath}/search/${encodeURIComponent("김치전")}`);
  }

  const endpoints: ApiDocsEndpoint[] = [
    {
      id: "catalog",
      method: "GET",
      path: "/",
      description: "등록된 사이트 메타데이터. 프론트는 이 응답으로 이름, 끼니 슬롯, 아이콘, 기능 플래그를 그립니다.",
      curls: [`curl ${baseUrl}/`],
      responseExample: `{
  "requestId": "...",
  "timestamp": "2026-08-25T13:00:00.000Z",
  "message": "api.밥.net",
  "providers": [
    {
      "id": "kdmhs",
      "name": "디미고 급식",
      "schoolName": "한국디지털미디어고등학교",
      "basePath": "/kdmhs",
      "description": "...",
      "keywords": ["급식", "디미고"],
      "features": { "foodSearch": true },
      "meals": [
        {
          "id": "lunch",
          "title": "점심",
          "operatingHours": null,
          "icon": "/icon/lunch.svg",
          "background": "/img/lunch.svg",
          "activeUntilHour": 14
        }
      ]
    }
  ]
}`,
    },
    {
      id: "meals",
      method: "GET",
      path: "/{provider}/{date}",
      description: "해당 날짜의 식단. 슬롯 순서는 카탈로그의 meals 배열과 같아요.",
      curls: mealCurls,
      responseExample: `{
  "requestId": "...",
  "timestamp": "...",
  "date": "${exampleDate}",
  "data": {
    "meals": [
      {
        "id": "lunch",
        "title": "점심",
        "operatingHours": null,
        "kcal": 812,
        "image": "https://...",
        "groups": [
          { "id": "regular", "label": null, "price": null, "items": ["흰쌀밥", "김치찌개"] },
          { "id": "plus", "label": "플러스바", "price": null, "items": ["..."] },
          { "id": "simple", "label": "간편식", "price": null, "items": ["..."] }
        ]
      }
    ]
  }
}`,
      fieldTables: [
        {
          title: "프로바이더별 groups 차이",
          rows: [
            {
              name: "kdmhs",
              type: "Cafeteria",
              description: "regular · plus(플러스바) · simple(간편식). kcal·image 채워짐",
            },
            {
              name: "dgu · horang",
              type: "Corner",
              description: "코너 이름이 id·label. price(원) 있음. kcal·image는 null",
            },
          ],
        },
      ],
    },
    {
      id: "search",
      method: "GET",
      path: "/{provider}/search/{food}",
      description: "메뉴 이름으로 과거 사진을 찾습니다. 카탈로그 foodSearch: true 인 프로바이더만 지원해요.",
      curls: searchCurls,
      responseExample: `{
  "requestId": "...",
  "timestamp": "...",
  "foodName": "김치전",
  "matchedMenu": "김치전",
  "image": "https://...",
  "date": "2026-08-20",
  "mealType": "lunch",
  "section": "regular"
}`,
      notes: searchProvider
        ? ["section — kdmhs 전용: regular · plus · simple"]
        : ["현재 카탈로그에 search 가능 프로바이더가 없어요."],
    },
    {
      id: "health",
      method: "GET",
      path: "/{provider}/health",
      description: "저장된 식단 문서 수와 마지막 갱신 시각.",
      curls: [`curl ${baseUrl}/kdmhs/health`],
      responseExample: `{
  "requestId": "...",
  "timestamp": "...",
  "status": "ok",
  "database": {
    "connected": true,
    "totalMealData": 42,
    "lastUpdated": "2026-08-25T09:00:00.000Z"
  }
}`,
      notes: ["database.connected는 현재 항상 true입니다. 실시간 ping은 아니에요."],
    },
  ];

  return {
    title: "API",
    subtitle: "학교·대학·구내식당 식단을 JSON으로 가져옵니다. 공개 엔드포인트는 인증이 필요 없어요.",
    baseUrl,
    exampleDate,
    toc: [
      { id: "overview", label: "개요" },
      { id: "providers", label: "프로바이더" },
      { id: "catalog", label: "카탈로그" },
      { id: "meals", label: "식단" },
      { id: "search", label: "검색" },
      { id: "health", label: "헬스" },
      { id: "types", label: "타입" },
      { id: "errors", label: "오류" },
    ],
    overviewBullets: [
      "날짜 형식: YYYY-MM-DD (한국 시간 기준 운영)",
      "응답 envelope: requestId, timestamp 포함",
      "모든 프로바이더 식단 응답은 같은 PublicDayMenu 스키마",
      "식단 데이터는 서버에서 주기적으로 자동 수집됩니다",
      "CORS: 허용된 origin에서만 브라우저 fetch 가능",
    ],
    providerNote:
      "provider 경로 세그먼트는 basePath 슬래시를 뺀 id와 같아요 (/kdmhs → kdmhs).",
    endpoints,
    typeSchemas: [
      { title: "PublicMeal", rows: PUBLIC_MEAL_FIELDS },
      { title: "PublicMenuGroup", rows: PUBLIC_MENU_GROUP_FIELDS },
    ],
    errors: {
      example: `{
  "requestId": "...",
  "timestamp": "...",
  "error": "${MEAL_ERROR_MESSAGES.noMealData}"
}`,
      rows: ERROR_ROWS,
      note: "OCR 실패 등으로 빈 { meals: [] } 가 저장된 날짜는 200으로 빈 슬롯이 올 수 있어요.",
    },
  };
}
