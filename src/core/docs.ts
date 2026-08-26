import { MEAL_ERROR_MESSAGES } from "@/core/mealErrors";
import type { SitePresentation } from "@/core/types";
import { APP_VERSION } from "@/core/version";

const SCALAR_VERSION = "1.28.5";

export interface OpenApiDocument {
  openapi: string;
  info: {
    title: string;
    description: string;
    version: string;
  };
  servers: { url: string; description: string }[];
  tags: { name: string; description: string }[];
  paths: Record<string, unknown>;
  components: { schemas: Record<string, unknown> };
}

export function buildOpenApiDocument(
  providers: SitePresentation[],
  baseUrl: string,
  exampleDate: string,
): OpenApiDocument {
  const providerIds = providers.map((site) => site.id);
  const searchProviders = providers.filter((site) => site.features.foodSearch);
  const exampleProvider = providers.find((site) => site.features.foodSearch)?.id ?? providers[0]?.id ?? "kdmhs";
  const providerEnum = providerIds.length > 0 ? { enum: providerIds } : {};
  const providerList = providerIds.length > 0 ? providerIds.join(", ") : "등록된 프로바이더 없음";

  return {
    openapi: "3.1.0",
    info: {
      title: "밥.net API",
      version: APP_VERSION,
      description: [
        "오늘 뭐 나오지? 학교·식당 급식을 하나의 API로 조회하세요.",
        "",
        "어떤 프로바이더든 응답은 동일한 `PublicDayMenu` 스키마로 내려옵니다. 한 번 연동하면 새 학교가 추가돼도 코드를 고칠 필요가 없어요.",
        "",
        "### 시작하기",
        "",
        "1. `GET /` — 사용 가능한 프로바이더 목록을 확인합니다.",
        "2. `GET /{provider}/{date}` — 원하는 날짜의 식단을 가져옵니다.",
        "",
        "### 알아두기",
        "",
        `- **날짜 형식** — \`YYYY-MM-DD\` (KST 기준)`,
        `- **공통 응답 필드** — 모든 응답에 \`requestId\`, \`timestamp\`가 포함됩니다`,
        `- **프로바이더** — ${providerList}`,
        `- **인증** — 필요 없습니다. 바로 호출하세요`,
        "",
        "### AI 에이전트 연동",
        "",
        "MCP를 지원합니다. `POST /mcp` (Streamable HTTP) 하나면 Cursor·Claude 같은 에이전트가 식단을 읽을 수 있어요.",
        "",
        "새 학교를 추가하고 싶다면 [bap-back README](https://github.com/sspzoa/bap-back#새-프로바이더-추가)를 참고하세요.",
      ].join("\n"),
    },
    servers: [{ url: baseUrl, description: "프로덕션" }],
    tags: [
      { name: "Catalog", description: "등록된 사이트와 화면 구성에 필요한 메타데이터" },
      { name: "Changelog", description: "semver별 사용자-facing 변경 이력" },
      { name: "Meals", description: "날짜별 식단 조회" },
      { name: "Search", description: "메뉴 이름으로 과거 급식 사진 찾기 (`foodSearch` 지원 프로바이더 전용)" },
      { name: "Health", description: "프로바이더별 데이터 적재 상태" },
      { name: "MCP", description: "AI 에이전트용 Model Context Protocol 엔드포인트" },
    ],
    paths: {
      "/": {
        get: {
          tags: ["Catalog"],
          summary: "프로바이더 카탈로그 조회",
          description:
            "등록된 모든 사이트의 메타데이터를 반환합니다. 이름, 끼니 슬롯, 아이콘, 기능 플래그가 담겨 있어 프론트엔드가 별도 설정 없이 이 응답만으로 화면을 구성할 수 있습니다.",
          operationId: "getCatalog",
          responses: {
            "200": {
              description: "등록된 프로바이더 목록",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/CatalogResponse" },
                },
              },
            },
          },
        },
      },
      "/changelog": {
        get: {
          tags: ["Changelog"],
          summary: "CHANGELOG",
          description: "루트 `CHANGELOG.md`를 HTML 페이지로 렌더링합니다. 프론트 홈 **CHANGELOG** 링크가 이 URL로 이동합니다.",
          operationId: "getChangelog",
          responses: {
            "200": {
              description: "CHANGELOG HTML 페이지",
              content: {
                "text/html": {
                  schema: { type: "string" },
                },
              },
            },
          },
        },
      },
      "/{provider}/{date}": {
        get: {
          tags: ["Meals"],
          summary: "날짜별 식단 조회",
          description: [
            "지정한 날짜의 식단을 반환합니다. 끼니 순서는 카탈로그의 `meals` 배열과 동일합니다.",
            "",
            "프로바이더마다 그룹 구성이 조금 다릅니다.",
            "",
            "- **kdmhs** — `regular` / `plus` / `simple` 그룹, 칼로리(`kcal`)와 급식 사진(`image`) 포함",
            "- **dgu · horang** — 코너 이름이 그룹이 되고 가격(`price`) 포함",
          ].join("\n"),
          operationId: "getMeals",
          parameters: [
            {
              name: "provider",
              in: "path",
              required: true,
              description: "프로바이더 id (`basePath`에서 슬래시를 뺀 값)",
              schema: { type: "string", example: exampleProvider, ...providerEnum },
            },
            {
              name: "date",
              in: "path",
              required: true,
              description: "조회할 날짜 (`YYYY-MM-DD`, KST)",
              schema: { type: "string", format: "date", example: exampleDate },
            },
          ],
          responses: {
            "200": {
              description: "해당 날짜의 식단",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MealResponse" },
                },
              },
            },
            "400": {
              description: "날짜 형식이 `YYYY-MM-DD`가 아닌 경우",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                  example: { requestId: "...", timestamp: "...", error: "Invalid date format" },
                },
              },
            },
            "404": {
              description: `식단이 없는 경우 — 조회 범위를 벗어나면 "${MEAL_ERROR_MESSAGES.noMealData}", 범위 안이지만 데이터가 없으면(방학·휴무 등) "${MEAL_ERROR_MESSAGES.noMealOperation}"`,
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                  examples: {
                    noMealData: {
                      value: { requestId: "...", timestamp: "...", error: MEAL_ERROR_MESSAGES.noMealData },
                    },
                    noMealOperation: {
                      value: { requestId: "...", timestamp: "...", error: MEAL_ERROR_MESSAGES.noMealOperation },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/{provider}/search/{food}": {
        get: {
          tags: ["Search"],
          summary: "메뉴 사진 검색",
          description: [
            "메뉴 이름으로 가장 최근에 나온 급식 사진을 찾아줍니다. 예를 들어 `김치전`을 검색하면 김치전이 나왔던 날짜와 그날의 사진을 반환합니다.",
            "",
            `현재 지원 프로바이더: ${
              searchProviders.length > 0 ? searchProviders.map((site) => `\`${site.id}\``).join(", ") : "없음"
            }`,
          ].join("\n"),
          operationId: "searchFood",
          parameters: [
            {
              name: "provider",
              in: "path",
              required: true,
              schema: {
                type: "string",
                example: exampleProvider,
                ...(searchProviders.length > 0 ? { enum: searchProviders.map((site) => site.id) } : {}),
              },
            },
            {
              name: "food",
              in: "path",
              required: true,
              description: "찾을 메뉴 이름 (부분 일치)",
              schema: { type: "string", example: "김치전" },
            },
          ],
          responses: {
            "200": {
              description: "가장 최근에 해당 메뉴가 나온 날짜와 사진",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/SearchResponse" },
                },
              },
            },
            "404": {
              description: "해당 메뉴를 찾지 못했거나 검색을 지원하지 않는 프로바이더인 경우",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                },
              },
            },
          },
        },
      },
      "/{provider}/health": {
        get: {
          tags: ["Health"],
          summary: "프로바이더 상태 확인",
          description:
            "프로바이더에 저장된 식단 문서 수와 마지막 갱신 시각을 반환합니다. 데이터가 최신인지 모니터링할 때 사용하세요. 참고로 `database.connected`는 실시간 ping이 아니라 항상 `true`입니다.",
          operationId: "getHealth",
          parameters: [
            {
              name: "provider",
              in: "path",
              required: true,
              schema: { type: "string", example: exampleProvider, ...providerEnum },
            },
          ],
          responses: {
            "200": {
              description: "데이터 적재 상태",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/HealthResponse" },
                },
              },
            },
          },
        },
      },
      "/mcp": {
        post: {
          tags: ["MCP"],
          summary: "MCP 엔드포인트 (Streamable HTTP)",
          description: [
            "Cursor·Claude 같은 에이전트가 식단을 바로 읽게 하는 MCP 엔드포인트입니다. 인증 없이 Streamable HTTP로 연결됩니다. 사용자가 오늘 점심, 특정 학교 메뉴, 급식 사진을 묻거나 식단을 근거로 답해야 하면 — 학교 이름을 말하지 않아도 — 이 서버를 쓰면 됩니다.",
            "",
            "**언제 어떤 도구**",
            "- `bap_list_providers` — 식당 id·끼니 슬롯·사진검색 지원 여부를 확정. 세션에서 한 번이면 충분합니다",
            "- `bap_get_meals` — 하루(또는 한 끼) 식단. 식단 질의의 기본 도구",
            "- `bap_search_food` — 메뉴 이름으로 과거 급식 사진. 오늘 메뉴 목록이 아닙니다",
            "",
            "**잘 쓰는 법**",
            "- 시간대는 항상 KST. `오늘`/`내일`은 호출 전에 `YYYY-MM-DD`로 바꿉니다",
            "- `provider`는 id(`kdmhs`, `dgu`, `horang`) 또는 이름(디미고, 동국대, 호랑). 애매하면 목록을 보고 id로 다시 호출하세요",
            "- 한 식당·하루에 한 호출. 여러 날은 날짜마다 따로",
            "",
            "**리소스** — `bap://providers`, `bap://meals/{provider}/{date}`",
            "",
            "**연결 설정**",
            "",
            "```json",
            `{ "mcpServers": { "밥.net": { "url": "${baseUrl}/mcp" } } }`,
            "```",
          ].join("\n"),
          operationId: "mcp",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object", additionalProperties: true },
              },
            },
          },
          responses: {
            "200": {
              description: "MCP 프로토콜 응답",
            },
          },
        },
      },
    },
    components: {
      schemas: {
        CatalogResponse: {
          type: "object",
          required: ["requestId", "timestamp", "message", "providers"],
          properties: {
            requestId: { type: "string" },
            timestamp: { type: "string", format: "date-time" },
            message: { type: "string", example: "api.밥.net" },
            providers: { type: "array", items: { $ref: "#/components/schemas/SitePresentation" } },
          },
        },
        SitePresentation: {
          type: "object",
          required: ["id", "name", "schoolName", "basePath", "description", "keywords", "features", "meals"],
          properties: {
            id: { type: "string", description: "basePath에서 슬래시를 뺀 값", example: "kdmhs" },
            name: { type: "string", example: "디미고 급식" },
            schoolName: { type: "string", example: "한국디지털미디어고등학교" },
            basePath: { type: "string", example: "/kdmhs" },
            description: { type: "string" },
            keywords: { type: "array", items: { type: "string" } },
            features: {
              type: "object",
              required: ["foodSearch"],
              properties: { foodSearch: { type: "boolean" } },
            },
            meals: { type: "array", items: { $ref: "#/components/schemas/MealSlotMeta" } },
          },
        },
        MealSlotMeta: {
          type: "object",
          required: ["id", "title", "operatingHours", "icon", "background", "activeUntilHour"],
          properties: {
            id: { type: "string", example: "lunch" },
            title: { type: "string", example: "점심" },
            operatingHours: { type: ["string", "null"], example: "11:30~14:00" },
            icon: { type: "string", example: "/icon/lunch.svg" },
            background: { type: "string", example: "/img/lunch.svg" },
            activeUntilHour: { type: "integer", example: 14 },
          },
        },
        MealResponse: {
          type: "object",
          required: ["requestId", "timestamp", "date", "data"],
          properties: {
            requestId: { type: "string" },
            timestamp: { type: "string", format: "date-time" },
            date: { type: "string", format: "date", example: exampleDate },
            data: { $ref: "#/components/schemas/PublicDayMenu" },
          },
        },
        PublicDayMenu: {
          type: "object",
          required: ["meals"],
          properties: {
            meals: { type: "array", items: { $ref: "#/components/schemas/PublicMeal" } },
          },
        },
        PublicMeal: {
          type: "object",
          required: ["id", "title", "operatingHours", "kcal", "image", "groups"],
          properties: {
            id: { type: "string", example: "lunch" },
            title: { type: "string", example: "점심" },
            operatingHours: { type: ["string", "null"] },
            kcal: { type: ["number", "null"], example: 812 },
            image: { type: ["string", "null"] },
            groups: { type: "array", items: { $ref: "#/components/schemas/PublicMenuGroup" } },
          },
        },
        PublicMenuGroup: {
          type: "object",
          required: ["id", "label", "price", "items"],
          properties: {
            id: { type: "string", description: "regular · plus · simple 또는 코너 이름" },
            label: { type: ["string", "null"], example: "플러스바" },
            price: { type: ["string", "null"], example: "6500" },
            items: { type: "array", items: { type: "string" } },
          },
        },
        SearchResponse: {
          type: "object",
          required: ["requestId", "timestamp", "foodName", "image", "date", "mealType"],
          properties: {
            requestId: { type: "string" },
            timestamp: { type: "string", format: "date-time" },
            foodName: { type: "string" },
            matchedMenu: { type: "string" },
            image: { type: "string" },
            date: { type: "string", format: "date" },
            mealType: { type: "string", example: "lunch" },
            section: { type: "string", enum: ["regular", "plus", "simple"], description: "kdmhs 전용" },
          },
        },
        HealthResponse: {
          type: "object",
          required: ["requestId", "timestamp", "status", "database"],
          properties: {
            requestId: { type: "string" },
            timestamp: { type: "string", format: "date-time" },
            status: { type: "string", example: "ok" },
            database: {
              type: "object",
              required: ["connected", "totalMealData", "lastUpdated"],
              properties: {
                connected: { type: "boolean", description: "현재 항상 true (실시간 ping 아님)" },
                totalMealData: { type: "integer" },
                lastUpdated: { type: ["string", "null"], format: "date-time" },
              },
            },
          },
        },
        ErrorResponse: {
          type: "object",
          required: ["requestId", "timestamp", "error"],
          properties: {
            requestId: { type: "string" },
            timestamp: { type: "string", format: "date-time" },
            error: { type: "string" },
          },
        },
      },
    },
  };
}

export function renderScalarHtml(specUrl: string): string {
  return `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>밥.net API</title>
    <style>body { margin: 0; }</style>
  </head>
  <body>
    <div id="app"></div>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@${SCALAR_VERSION}"></script>
    <script>
      Scalar.createApiReference("#app", { url: ${JSON.stringify(specUrl)} });
    </script>
  </body>
</html>
`;
}
