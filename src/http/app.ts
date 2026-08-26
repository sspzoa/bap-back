import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { Elysia, ElysiaCustomStatusResponse, status, t } from "elysia";
import { loadChangelogMarkdown, renderChangelogHtml } from "@/core/changelog";
import { CONFIG } from "@/core/config";
import { allowedFrontendOrigins, MCP_CORS } from "@/core/cors";
import { ApiError, MealNoOperationError, MealNotFoundError } from "@/core/errors";
import { logger } from "@/core/logger";
import { MEAL_ERROR_MESSAGES } from "@/core/mealErrors";
import type { MealResponse } from "@/core/types";
import {
  apiModels,
  CatalogResponse,
  ErrorResponse,
  HealthResponse,
  MealResponse as MealResponseSchema,
  SearchResponse,
} from "@/http/models";
import { openapiInfo, openapiServers, openapiTags } from "@/http/openapi";
import type { ProviderRegistry } from "@/providers/registry";
import type { MealProvider } from "@/providers/types";
import { isValidDate } from "@/utils/date";

export interface McpFetchHandler {
  fetch(request: Request): Response | Promise<Response>;
}

export interface AppDeps {
  registry: ProviderRegistry;
  mcpHandler: McpFetchHandler;
}

function requireProvider(registry: ProviderRegistry, id: string, requestId: string, timestamp: string): MealProvider {
  const provider = registry.findById(id) ?? registry.findByPath(`/${id}`);
  if (!provider) {
    throw status(404, { requestId, timestamp, error: "Endpoint not found" });
  }
  return provider;
}

export function createApp({ registry, mcpHandler }: AppDeps) {
  return new Elysia({ name: "bap-api" })
    .decorate("registry", registry)
    .decorate("mcpHandler", mcpHandler)
    .error({ ApiError, MealNotFoundError, MealNoOperationError })
    .derive({ as: "global" }, ({ request }) => {
      const path = new URL(request.url).pathname;
      const requestLogger = logger.request(request.method, path);
      return {
        requestId: requestLogger.context.requestId ?? "unknown",
        timestamp: new Date().toISOString(),
        requestLogger,
        startedAt: Date.now(),
      };
    })
    .onAfterHandle({ as: "global" }, ({ requestLogger, startedAt, set, responseValue }) => {
      const currentStatus = responseValue instanceof Response ? responseValue.status : Number(set.status) || 200;
      requestLogger.response(currentStatus, Date.now() - startedAt);
    })
    .onError({ as: "global" }, ({ code, error, set, requestId, timestamp, requestLogger }) => {
      const id = requestId ?? "unknown";
      const ts = timestamp ?? new Date().toISOString();

      if (error instanceof ElysiaCustomStatusResponse) {
        set.status = error.code;
        return error.response;
      }

      if (error instanceof ApiError) {
        set.status = error.status;
        requestLogger?.error(`Request failed`, error);
        return { requestId: id, timestamp: ts, error: error.message };
      }

      if (code === "NOT_FOUND") {
        set.status = 404;
        return { requestId: id, timestamp: ts, error: "Endpoint not found" };
      }

      if (code === "VALIDATION") {
        set.status = 400;
        return { requestId: id, timestamp: ts, error: "Invalid date format" };
      }

      logger.error("Request error:", error);
      set.status = 500;
      return { requestId: id, timestamp: ts, error: "Internal server error" };
    })
    .use(
      new Elysia({ name: "public-api" })
        .use(
          cors({
            origin: allowedFrontendOrigins(),
            methods: ["GET", "POST", "OPTIONS"],
            allowedHeaders: ["Content-Type", "Authorization"],
          }),
        )
        .model(apiModels)
        .use(
          openapi({
            path: "/docs",
            specPath: "/docs/openapi.json",
            provider: "scalar",
            documentation: {
              info: openapiInfo(registry),
              servers: openapiServers(),
              tags: openapiTags,
            },
          }),
        )
        .get(
          "/",
          ({ requestId, timestamp }) => ({
            requestId,
            timestamp,
            message: "api.밥.net",
            providers: registry.getProviders().map((provider) => provider.config.presentation),
          }),
          {
            response: { 200: CatalogResponse },
            detail: {
              tags: ["Catalog"],
              summary: "프로바이더 카탈로그 조회",
              description:
                "등록된 모든 사이트의 메타데이터를 반환합니다. 이름, 끼니 슬롯, 아이콘, 기능 플래그가 담겨 있어 프론트엔드가 별도 설정 없이 이 응답만으로 화면을 구성할 수 있습니다.",
              operationId: "getCatalog",
            },
          },
        )
        .get(
          "/changelog",
          async ({ set }) => {
            set.headers["content-type"] = "text/html; charset=utf-8";
            return renderChangelogHtml(await loadChangelogMarkdown());
          },
          {
            response: t.String(),
            detail: {
              tags: ["Changelog"],
              summary: "CHANGELOG",
              description:
                "루트 `CHANGELOG.md`를 HTML 페이지로 렌더링합니다. 프론트 홈 **CHANGELOG** 링크가 이 URL로 이동합니다.",
              operationId: "getChangelog",
            },
          },
        )
        .get("/openapi.json", ({ redirect }) => redirect("/docs/openapi.json"), {
          detail: { hide: true },
        })
        .guard({ params: t.Object({ provider: t.String() }) }, (app) =>
          app
            .resolve(({ params, requestId, timestamp }) => ({
              mealProvider: requireProvider(registry, params.provider, requestId, timestamp),
            }))
            .get(
              "/:provider/health",
              async ({ mealProvider, requestId, timestamp }) => {
                const stats = await mealProvider.getStats();
                return {
                  requestId,
                  timestamp,
                  status: "ok",
                  database: {
                    connected: true,
                    totalMealData: stats.totalMealData,
                    lastUpdated: stats.lastUpdated?.toISOString() ?? null,
                  },
                };
              },
              {
                response: {
                  200: HealthResponse,
                  404: ErrorResponse,
                },
                detail: {
                  tags: ["Health"],
                  summary: "프로바이더 상태 확인",
                  description:
                    "프로바이더에 저장된 식단 문서 수와 마지막 갱신 시각을 반환합니다. 데이터가 최신인지 모니터링할 때 사용하세요. 참고로 `database.connected`는 실시간 ping이 아니라 항상 `true`입니다.",
                  operationId: "getHealth",
                },
              },
            )
            .get(
              "/:provider/search/:food",
              async ({ mealProvider, params, request, requestId, timestamp }) => {
                if (!mealProvider.handleExtraRoute) {
                  throw status(404, { requestId, timestamp, error: "Endpoint not found" });
                }

                const extraPayload = await mealProvider.handleExtraRoute(
                  `/search/${encodeURIComponent(params.food)}`,
                  request.method,
                );
                if (!extraPayload || typeof extraPayload !== "object") {
                  throw status(404, { requestId, timestamp, error: "Endpoint not found" });
                }

                return { requestId, timestamp, ...extraPayload };
              },
              {
                params: t.Object({
                  provider: t.String(),
                  food: t.String({ minLength: 1, examples: ["김치전"] }),
                }),
                response: {
                  200: SearchResponse,
                  404: ErrorResponse,
                },
                detail: {
                  tags: ["Search"],
                  summary: "메뉴 사진 검색",
                  description: [
                    "메뉴 이름으로 가장 최근에 나온 급식 사진을 찾아줍니다. 예를 들어 `김치전`을 검색하면 김치전이 나왔던 날짜와 그날의 사진을 반환합니다.",
                    "",
                    `현재 지원 프로바이더: ${
                      registry
                        .getProviders()
                        .filter((provider) => provider.config.presentation.features.foodSearch)
                        .map((provider) => `\`${provider.config.id}\``)
                        .join(", ") || "없음"
                    }`,
                  ].join("\n"),
                  operationId: "searchFood",
                },
              },
            )
            .get(
              "/:provider/:date",
              async ({ mealProvider, params, requestId, timestamp }): Promise<MealResponse> => {
                if (!isValidDate(params.date)) {
                  throw status(400, { requestId, timestamp, error: "Invalid date format" });
                }

                const data = await mealProvider.getMealData(params.date);
                return { requestId, timestamp, date: params.date, data };
              },
              {
                params: t.Object({
                  provider: t.String({
                    description: "프로바이더 id (`basePath`에서 슬래시를 뺀 값)",
                    examples: ["kdmhs"],
                  }),
                  date: t.String({
                    format: "date",
                    pattern: "^\\d{4}-\\d{2}-\\d{2}$",
                    description: "조회할 날짜 (`YYYY-MM-DD`, KST)",
                    error: "Invalid date format",
                  }),
                }),
                response: {
                  200: MealResponseSchema,
                  400: ErrorResponse,
                  404: ErrorResponse,
                },
                detail: {
                  tags: ["Meals"],
                  summary: "날짜별 식단 조회",
                  description: [
                    "지정한 날짜의 식단을 반환합니다. 끼니 순서는 카탈로그의 `meals` 배열과 동일합니다.",
                    "",
                    "프로바이더마다 그룹 구성이 조금 다릅니다.",
                    "",
                    "- **kdmhs** — `regular` / `plus` / `simple` 그룹, 칼로리(`kcal`)와 급식 사진(`image`) 포함",
                    "- **dgu · horang** — 코너 이름이 그룹이 되고 가격(`price`) 포함",
                    "",
                    `식단이 없으면 조회 범위 밖은 "${MEAL_ERROR_MESSAGES.noMealData}", 범위 안 빈 날짜(방학·휴무 등)는 "${MEAL_ERROR_MESSAGES.noMealOperation}".`,
                  ].join("\n"),
                  operationId: "getMeals",
                },
              },
            ),
        ),
    )
    .use(
      new Elysia({ name: "mcp" })
        .use(
          cors({
            origin: MCP_CORS.origin,
            methods: [...MCP_CORS.methods],
            allowedHeaders: [...MCP_CORS.allowedHeaders],
            exposeHeaders: [...MCP_CORS.exposeHeaders],
          }),
        )
        .post("/mcp", ({ request }) => mcpHandler.fetch(request), {
          parse: "none",
          detail: {
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
              `{ "mcpServers": { "밥.net": { "url": "${CONFIG.PUBLIC_API_URL}/mcp" } } }`,
              "```",
            ].join("\n"),
            operationId: "mcp",
          },
        })
        .get("/mcp", ({ request }) => mcpHandler.fetch(request), {
          parse: "none",
          detail: { hide: true },
        })
        .delete("/mcp", ({ request }) => mcpHandler.fetch(request), {
          parse: "none",
          detail: { hide: true },
        }),
    );
}
