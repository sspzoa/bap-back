import { MEAL_ERROR_MESSAGES } from "@/core/mealErrors";
import type { ApiDocsEndpoint, ApiDocsField, ApiDocsGuide, ApiDocsPayload, SitePresentation } from "@/core/types";

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

const SITE_PRESENTATION_FIELDS: ApiDocsField[] = [
  { name: "id", type: "string", description: "프로바이더 id. basePath에서 슬래시를 뺀 값과 같아야 해요" },
  { name: "name", type: "string", description: "앱·카탈로그에 보이는 짧은 이름" },
  { name: "schoolName", type: "string", description: "학교·식당 공식 이름" },
  { name: "basePath", type: "string", description: "라우트 prefix (예: /kdmhs)" },
  { name: "description", type: "string", description: "한 줄 소개" },
  { name: "keywords", type: "string[]", description: "검색·SEO. MCP get_meals 이름 매칭에도 쓰여요" },
  { name: "features.foodSearch", type: "boolean", description: "true면 GET /{id}/search/{food} 와 search_food 도구" },
  { name: "meals", type: "MealSlotMeta[]", description: "끼니 슬롯. 이 순서가 API·UI·MCP 응답 순서" },
];

const MEAL_SLOT_FIELDS: ApiDocsField[] = [
  { name: "id", type: "string", description: "breakfast · lunch · dinner 또는 커스텀 슬롯 id" },
  { name: "title", type: "string", description: "표시 이름. 코너 매퍼는 Mongo time 과 이 값을 맞춰요" },
  { name: "operatingHours", type: "string | null", description: "운영 시간 표시 (예: 11:30~14:00)" },
  { name: "icon", type: "string", description: "프론트 public 경로 (예: /icon/lunch.svg)" },
  { name: "background", type: "string", description: "프론트 public 경로 (예: /img/lunch.svg)" },
  { name: "activeUntilHour", type: "number", description: "이 시각(KST) 전까지 현재 끼니로 강조" },
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

function buildAddingProviderGuide(): ApiDocsGuide {
  return {
    id: "adding-provider",
    title: "새 프로바이더",
    intro:
      "백엔드에 프로바이더 하나만 추가하면 HTTP API, MCP, 프론트 /select·홈·docs·manifest가 같은 카탈로그로 따라옵니다. bap-web에 사이트 폴더나 SITES 맵을 만들지 마세요.",
    steps: [
      {
        title: "1. id와 디렉터리",
        body: "소문자 id를 정합니다. 경로·Mongo DB·카탈로그 id가 모두 이 값을 씁니다. src/providers/{id}/ 아래에 config.ts, service.ts, index.ts를 만들고 필요하면 scrape·parse·ocr을 둡니다.",
        code: `src/providers/acme/
  config.ts      // ProviderConfig + presentation
  service.ts     // 수집·저장, 날짜 조회
  index.ts       // createAcmeProvider()
  scrape.ts      // 선택`,
      },
      {
        title: "2. presentation 채우기",
        body: "config.presentation이 GET / 카탈로그입니다. 프론트는 이 JSON으로 이름, 끼니 슬롯, 아이콘, 배경, foodSearch를 그립니다. id는 basePath에서 슬래시를 뺀 값과 같아야 해요.",
      },
      {
        title: "3. MealProvider와 공개 매퍼",
        body: "getMealData는 반드시 PublicDayMenu를 반환합니다. Mongo data 모양은 프로바이더마다 달라도 됩니다. 저장 형식이 기존과 같으면 매퍼를 재사용하세요. 조회는 getCachedMealDataOrThrow를 써서 404 의미를 맞춥니다.",
        code: `// 급식형 (아침·점심·저녁 + regular/plus/simple)
cafeteriaToPublic(presentation.meals, mongoData)

// 코너형 (중식·석식 + 코너 이름/가격)
cornerMenuToPublic(presentation.meals, mongoMeals)
// 코너 매퍼는 meal.time 과 slot.title 을 맞춰요.`,
      },
      {
        title: "4. 레지스트리 등록",
        body: "src/providers/init.ts 에서 createXxxProvider()를 register 합니다. server.ts에 경로를 직접 넣지 마세요. /{id}/{date} 와 /{id}/health 는 자동으로 붙습니다.",
      },
      {
        title: "5. 테스트와 문서",
        body: "파서·매퍼 단위 테스트를 추가하고 bun test 를 돌립니다. GET /docs 와 MCP list_providers 는 등록된 presentation을 그대로 쓰므로 문서 문구를 하드코딩할 필요 없어요.",
      },
      {
        title: "6. 프론트 에셋 (필요할 때만)",
        body: "기존 /icon/lunch.svg · /img/lunch.svg 를 그대로 가리키면 bap-web 수정은 없습니다. 새 아이콘·배경이 필요하면 bap-web의 public/icon, public/img 에 파일을 넣고 presentation URL만 맞추세요.",
      },
    ],
    fieldTables: [
      {
        title: "자동으로 따라오는 표면",
        rows: [
          { name: "GET /", type: "catalog", description: "select, 홈, docs, PWA manifest" },
          { name: "GET /{id}/{date}", type: "meals", description: "통일 PublicDayMenu" },
          { name: "GET /{id}/health", type: "health", description: "문서 수·lastUpdated" },
          { name: "POST /mcp", type: "MCP", description: "list_providers, get_meals, bap:// 리소스" },
          { name: "search", type: "optional", description: "features.foodSearch + handleExtraRoute 일 때만" },
        ],
      },
      {
        title: "매퍼 선택",
        rows: [
          {
            name: "cafeteriaToPublic",
            type: "Cafeteria",
            description: "breakfast/lunch/dinner + regular·plus·simple. 예: kdmhs",
          },
          {
            name: "cornerMenuToPublic",
            type: "Corner",
            description: "meals[].time + corners[]. 예: dgu, horang",
          },
          {
            name: "직접 변환",
            type: "Custom",
            description: "다른 Mongo 모양이면 PublicDayMenu만 맞추면 됩니다",
          },
        ],
      },
    ],
    checklist: [
      "getMealData가 PublicDayMenu를 반환한다",
      "presentation.meals 슬롯(id, title, icon, background, activeUntilHour)이 완전하다",
      "init.ts에 register 했고 server.ts에 경로를 직접 넣지 않았다",
      "파서·매퍼 테스트가 있다",
      "bap-web에 프로바이더 id를 하드코딩하지 않았다",
      "foodSearch를 켜면 handleExtraRoute(/search/:food)도 구현했다",
    ],
    notes: [
      "Mongo 문서는 항상 { _id: YYYY-MM-DD, data, createdAt, updatedAt } 입니다. saveMealData를 쓰세요.",
      "프로바이더마다 Mongo dbName을 따로 두는 것을 권장합니다.",
      "schedule.day는 JS getDay()와 같아요 (0=일 … 6=토). refreshType today는 해당 날짜, all은 주간·전체 재수집입니다.",
      "시크릿은 코드에 넣지 마세요. OCR이 필요하면 MINDLOGIC_KEY 같은 env를 쓰세요.",
      "레포 상세: bap-back README · AGENTS.md, 프론트는 bap-web README · AGENTS.md.",
    ],
  };
}

export function buildApiDocs(providers: SitePresentation[], baseUrl: string, exampleDate: string): ApiDocsPayload {
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
    {
      id: "mcp",
      method: "POST",
      path: "/mcp",
      description:
        "Model Context Protocol (Streamable HTTP). Cursor·Claude 등 에이전트가 식단 도구를 호출합니다. 인증이 필요 없어요.",
      curls: [
        `{
  "mcpServers": {
    "밥.net": {
      "url": "${baseUrl}/mcp"
    }
  }
}`,
      ],
      responseExample: `{
  "tools": [
    "list_providers — 등록된 학교·식당과 끼니 슬롯",
    "get_meals — 날짜별 식단 (date 생략 시 오늘 KST)",
    "search_food — 메뉴 사진 검색 (foodSearch 프로바이더)"
  ],
  "resources": [
    "bap://providers",
    "bap://meals/{provider}/{date}"
  ]
}`,
      fieldTables: [
        {
          title: "도구",
          rows: [
            { name: "list_providers", type: "tool", description: "카탈로그. 인자 없음" },
            {
              name: "get_meals",
              type: "tool",
              description: "provider(id 또는 이름), date?(YYYY-MM-DD), meal?(끼니 id/이름)",
            },
            {
              name: "search_food",
              type: "tool",
              description: "food(메뉴 이름), provider?(생략 시 foodSearch 첫 프로바이더)",
            },
          ],
        },
      ],
      notes: [
        "Cursor: ~/.cursor/mcp.json 또는 프로젝트 .cursor/mcp.json 에 위 JSON을 넣으면 됩니다.",
        "프로토콜: MCP Streamable HTTP (2026-07-28). 2025-era 클라이언트도 지원해요.",
        "GET /mcp 는 알림 스트림, DELETE /mcp 는 세션 종료용입니다.",
        "새 프로바이더를 등록하면 list_providers·get_meals·bap:// 리소스가 자동으로 포함됩니다. MCP 코드를 고칠 필요는 없어요.",
      ],
    },
  ];

  return {
    title: "API",
    subtitle: "프로바이더 카탈로그와 통일 식단 스키마. HTTP와 MCP가 같은 데이터를 쓰고, 백엔드만 추가하면 프론트가 따라옵니다.",
    baseUrl,
    exampleDate,
    toc: [
      { id: "overview", label: "개요" },
      { id: "providers", label: "프로바이더" },
      { id: "catalog", label: "카탈로그" },
      { id: "meals", label: "식단" },
      { id: "search", label: "검색" },
      { id: "health", label: "헬스" },
      { id: "mcp", label: "MCP" },
      { id: "types", label: "타입" },
      { id: "errors", label: "오류" },
      { id: "adding-provider", label: "새 프로바이더" },
    ],
    overviewBullets: [
      "날짜 형식: YYYY-MM-DD (한국 시간 기준 운영)",
      "응답 envelope: requestId, timestamp 포함",
      "모든 프로바이더 식단 응답은 같은 PublicDayMenu 스키마",
      "식단 데이터는 서버에서 주기적으로 자동 수집됩니다",
      "에이전트는 POST /mcp (MCP Streamable HTTP)로 같은 데이터를 쓸 수 있어요",
      "CORS: 허용된 origin에서만 브라우저 fetch 가능 (MCP는 *)",
    ],
    providerNote: "provider 경로 세그먼트는 basePath 슬래시를 뺀 id와 같아요 (/kdmhs → kdmhs).",
    endpoints,
    typeSchemas: [
      { title: "SitePresentation", rows: SITE_PRESENTATION_FIELDS },
      { title: "MealSlotMeta", rows: MEAL_SLOT_FIELDS },
      { title: "PublicMeal", rows: PUBLIC_MEAL_FIELDS },
      { title: "PublicMenuGroup", rows: PUBLIC_MENU_GROUP_FIELDS },
    ],
    guides: [buildAddingProviderGuide()],
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
