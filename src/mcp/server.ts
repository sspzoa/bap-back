import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { ApiError } from "@/core/errors";
import type { PublicDayMenu, SitePresentation } from "@/core/types";
import { resolveMeals, resolveProvider } from "@/mcp/resolve";
import type { MealProvider } from "@/providers/types";
import { formatDate, isValidDate } from "@/utils/date";

export const MCP_SERVER_NAME = "밥.net";
export const MCP_SERVER_VERSION = "1.0.0";

export const MCP_TOOLS = {
  listProviders: "bap_list_providers",
  getMeals: "bap_get_meals",
  searchFood: "bap_search_food",
} as const;

export interface McpMealSource {
  id: string;
  presentation: SitePresentation;
  getMealData(date: string): Promise<PublicDayMenu>;
  searchFood?(food: string): Promise<unknown | null>;
}

export interface BapMcpOptions {
  sources: McpMealSource[];
  today?: () => string;
}

function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string) {
  return { isError: true as const, content: [{ type: "text" as const, text: message }] };
}

function catalogEntry(source: McpMealSource) {
  const { presentation } = source;
  return {
    id: source.id,
    name: presentation.name,
    schoolName: presentation.schoolName,
    basePath: presentation.basePath,
    description: presentation.description,
    features: presentation.features,
    meals: presentation.meals.map((meal) => ({
      id: meal.id,
      title: meal.title,
      operatingHours: meal.operatingHours,
      activeUntilHour: meal.activeUntilHour,
    })),
  };
}

function asResolvable(source: McpMealSource) {
  return {
    id: source.id,
    name: source.presentation.name,
    schoolName: source.presentation.schoolName,
    basePath: source.presentation.basePath,
    keywords: source.presentation.keywords,
    source,
  };
}

async function readMeals(source: McpMealSource, date: string, meal?: string) {
  if (!isValidDate(date)) {
    return errorResult("날짜는 YYYY-MM-DD 형식이어야 해요.");
  }

  try {
    const menu = await source.getMealData(date);
    const meals = resolveMeals(menu.meals, meal);
    if (!meals.ok) {
      return errorResult(meals.message);
    }

    return jsonResult({
      provider: {
        id: source.id,
        name: source.presentation.name,
        schoolName: source.presentation.schoolName,
      },
      date,
      meals: meals.value,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return errorResult(error.message);
    }
    throw error;
  }
}

export function sourcesFromProviders(providers: readonly MealProvider[]): McpMealSource[] {
  return providers.map((provider) => ({
    id: provider.config.id,
    presentation: provider.config.presentation,
    getMealData: (date) => provider.getMealData(date),
    searchFood:
      provider.config.presentation.features.foodSearch && provider.handleExtraRoute
        ? async (food) => {
            try {
              return (await provider.handleExtraRoute!(`/search/${encodeURIComponent(food)}`, "GET")) ?? null;
            } catch (error) {
              if (error instanceof ApiError && error.status === 404) {
                return null;
              }
              throw error;
            }
          }
        : undefined,
  }));
}

function catalogHint(sources: McpMealSource[]): string {
  if (sources.length === 0) {
    return "현재 등록된 프로바이더가 없습니다.";
  }

  return sources
    .map((source) => {
      const slots = source.presentation.meals.map((meal) => `${meal.id}(${meal.title})`).join(", ");
      const search = source.presentation.features.foodSearch ? "; 사진검색 가능" : "";
      return `${source.id}: ${source.presentation.name} / ${source.presentation.schoolName} [${slots}${search}]`;
    })
    .join(" · ");
}

function searchableHint(sources: McpMealSource[]): string {
  const searchable = sources.filter((source) => source.searchFood);
  if (searchable.length === 0) {
    return "현재 사진 검색 가능한 프로바이더가 없습니다.";
  }
  return searchable.map((source) => `${source.id} (${source.presentation.name})`).join(", ");
}

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export function createBapMcpServer(options: BapMcpOptions): McpServer {
  const { sources } = options;
  const today = options.today ?? (() => formatDate(new Date()));
  const catalog = catalogHint(sources);
  const searchable = searchableHint(sources);

  const server = new McpServer(
    {
      name: MCP_SERVER_NAME,
      version: MCP_SERVER_VERSION,
      title: "밥.net 식단",
      websiteUrl: "https://밥.net",
    },
    {
      instructions: [
        "밥.net은 한국 학교·대학·구내식당 식단 API입니다. 시간대는 Asia/Seoul (KST)입니다.",
        "식단이 필요하면 bap_get_meals, 식당 목록·끼니 슬롯·검색 지원 여부는 bap_list_providers, 과거 메뉴 사진은 bap_search_food를 쓰세요.",
        "provider는 id(kdmhs, dgu, horang) 또는 이름/키워드(디미고, 동국대, 호랑)입니다. 애매하면 bap_list_providers 후 id로 다시 호출하세요.",
        "날짜는 반드시 YYYY-MM-DD입니다. '오늘/내일'은 호출 전에 KST 날짜로 바꾸세요.",
        `등록된 프로바이더: ${catalog}`,
      ].join("\n"),
    },
  );

  server.registerTool(
    MCP_TOOLS.listProviders,
    {
      title: "밥.net 등록된 식당 목록",
      description: [
        "밥.net에 등록된 학교·대학·구내식당(프로바이더) 카탈로그를 반환합니다. 실제 메뉴 항목은 포함하지 않습니다.",
        "언제: 사용자가 학교/식당을 말했지만 id가 불명확할 때, 끼니 슬롯(아침·중식·석식)이나 사진 검색 가능 여부를 확인할 때. bap_get_meals·bap_search_food보다 먼저 호출하세요.",
        "반환: JSON { providers: [{ id, name, schoolName, basePath, description, features.foodSearch, meals: [{ id, title, operatingHours, activeUntilHour }] }] }",
        "하지 않음: 날짜별 식단은 bap_get_meals. 메뉴 사진은 bap_search_food.",
        `현재 등록: ${catalog}`,
      ].join("\n"),
      annotations: READ_ONLY,
    },
    async () => jsonResult({ providers: sources.map(catalogEntry) }),
  );

  server.registerTool(
    MCP_TOOLS.getMeals,
    {
      title: "밥.net 날짜별 식단",
      description: [
        "한 식당의 하루 식단(메뉴 항목, 코너, 가격, 칼로리·사진이 있으면 포함)을 가져옵니다.",
        "언제: '오늘 디미고 점심', '동국대 석식', '호랑 내일 메뉴'처럼 구체적인 식단이 필요할 때. id가 없으면 bap_list_providers로 확인하세요.",
        "반환: JSON { provider: { id, name, schoolName }, date, meals: [{ id, title, operatingHours, kcal, image, groups: [{ id, label, price, items }] }] }",
        "급식형(kdmhs 등): groups는 regular / plus(플러스바) / simple(간편식). kcal·image가 있을 수 있습니다.",
        "코너형(dgu·horang 등): groups는 코너 이름, price(원). kcal·image는 보통 null.",
        "오류: 프로바이더를 못 찾음(여러 곳이 맞으면 id로 재지정), 잘못된 날짜, '식단 정보가 없어요'(저장 범위 밖), '식단 운영이 없어요'(그날 휴무·미게시).",
        "하지 않음: 과거 메뉴 사진 검색은 bap_search_food. 식당 목록은 bap_list_providers.",
        `현재 등록: ${catalog}`,
      ].join("\n"),
      annotations: READ_ONLY,
      inputSchema: z.object({
        provider: z
          .string()
          .min(1)
          .describe(
            "식당 id 또는 이름/키워드. 예: kdmhs, 디미고, dgu, 동국대, horang, 호랑. 여러 곳이 매칭되면 id로 다시 지정해야 합니다.",
          ),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
          .optional()
          .describe("조회 날짜 YYYY-MM-DD (KST). 생략하면 오늘. '내일' 같은 상대 표현은 호출 전에 변환하세요."),
        meal: z
          .string()
          .min(1)
          .optional()
          .describe(
            "한 끼만 볼 때. 슬롯 id 또는 제목 일부: breakfast, lunch, dinner, 아침, 점심, 중식, 저녁, 석식. 생략하면 그날 전 끼니.",
          ),
      }),
    },
    async ({ provider, date, meal }) => {
      const resolved = resolveProvider(sources.map(asResolvable), provider);
      if (!resolved.ok) {
        return errorResult(resolved.message);
      }
      return readMeals(resolved.value.source, date ?? today(), meal);
    },
  );

  server.registerTool(
    MCP_TOOLS.searchFood,
    {
      title: "밥.net 메뉴 사진 검색",
      description: [
        "메뉴 이름으로 과거에 나온 급식 사진을 찾습니다. 오늘의 식단 목록이 아니라 아카이브 이미지 검색입니다.",
        "언제: '김치전 사진', '이 메뉴 어떻게 생겼어'처럼 이미지가 필요할 때. 오늘 메뉴 텍스트는 bap_get_meals.",
        `제약: features.foodSearch가 true인 프로바이더만. 사진검색 가능: ${searchable}. 미지원 식당을 지정하면 에러입니다.`,
        "반환: JSON { foodName, matchedMenu, image, date, mealType, section }. section은 kdmhs에서 regular | plus | simple.",
        "오류: 메뉴를 찾지 못함, 프로바이더가 검색 미지원.",
        `현재 등록: ${catalog}`,
      ].join("\n"),
      annotations: READ_ONLY,
      inputSchema: z.object({
        food: z.string().min(1).describe("찾을 메뉴 이름. 예: 김치전, 돈가스. 공백만이면 거절합니다."),
        provider: z
          .string()
          .min(1)
          .optional()
          .describe(
            `사진 검색할 식당 id 또는 이름. 생략 시 foodSearch를 지원하는 첫 프로바이더(${searchable || "없음"}).`,
          ),
      }),
    },
    async ({ food, provider }) => {
      const query = food.trim();
      if (!query) {
        return errorResult("food(메뉴 이름)를 입력해 주세요.");
      }

      const searchSources = sources.filter((source) => source.searchFood);
      if (searchSources.length === 0) {
        return errorResult("메뉴 검색을 지원하는 프로바이더가 없어요.");
      }

      const target = provider
        ? resolveProvider(sources.map(asResolvable), provider)
        : { ok: true as const, value: asResolvable(searchSources[0]) };

      if (!target.ok) {
        return errorResult(target.message);
      }

      const source = target.value.source;
      if (!source.searchFood) {
        return errorResult(`${source.id}는 메뉴 검색을 지원하지 않아요.`);
      }

      const result = await source.searchFood(query);
      if (!result) {
        return errorResult(`해당 메뉴를 찾을 수 없어요: ${query}`);
      }

      return jsonResult(result);
    },
  );

  server.registerResource(
    "providers",
    "bap://providers",
    {
      title: "등록된 식당 목록",
      description: `bap_list_providers와 같은 카탈로그 JSON. 식단이 아니라 식당·끼니 슬롯 메타데이터입니다. 현재: ${catalog}`,
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify({ providers: sources.map(catalogEntry) }, null, 2),
        },
      ],
    }),
  );

  server.registerResource(
    "meals",
    new ResourceTemplate("bap://meals/{provider}/{date}", {
      list: async () => ({
        resources: sources.map((source) => ({
          uri: `bap://meals/${source.id}/${today()}`,
          name: `${source.presentation.name} 오늘`,
          mimeType: "application/json",
        })),
      }),
    }),
    {
      title: "날짜별 식단",
      description:
        "bap_get_meals와 같은 하루 식단 JSON. URI는 bap://meals/{provider}/{date} 이고 date는 YYYY-MM-DD(KST)입니다. provider는 id 또는 이름.",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const providerQuery = String(variables.provider ?? "");
      const date = String(variables.date ?? today());
      const resolved = resolveProvider(sources.map(asResolvable), providerQuery);
      if (!resolved.ok) {
        return {
          contents: [{ uri: uri.href, mimeType: "text/plain", text: resolved.message }],
        };
      }

      const result = await readMeals(resolved.value.source, date);
      const text = result.content[0]?.text ?? "";
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: result.isError ? "text/plain" : "application/json",
            text,
          },
        ],
      };
    },
  );

  return server;
}
