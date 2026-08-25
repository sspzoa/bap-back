import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { ApiError } from "@/core/errors";
import type { PublicDayMenu, SitePresentation } from "@/core/types";
import { resolveMeals, resolveProvider } from "@/mcp/resolve";
import type { MealProvider } from "@/providers/types";
import { formatDate, isValidDate } from "@/utils/date";

export const MCP_SERVER_NAME = "밥.net";
export const MCP_SERVER_VERSION = "1.0.0";

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

export function createBapMcpServer(options: BapMcpOptions): McpServer {
  const { sources } = options;
  const today = options.today ?? (() => formatDate(new Date()));

  const server = new McpServer({
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
  });

  server.registerTool(
    "list_providers",
    {
      description:
        "밥.net에 등록된 학교·대학·구내식당 목록과 끼니 슬롯, 메뉴 검색 지원 여부를 가져옵니다. get_meals·search_food를 쓰기 전에 호출하세요.",
    },
    async () => jsonResult({ providers: sources.map(catalogEntry) }),
  );

  server.registerTool(
    "get_meals",
    {
      description:
        "한 프로바이더의 날짜별 식단을 가져옵니다. date를 생략하면 오늘(한국 시간)입니다. meal로 아침·점심·저녁 등 한 끼만 고를 수 있어요.",
      inputSchema: z.object({
        provider: z.string().describe("프로바이더 id 또는 이름 (예: kdmhs, 디미고, 동국대, 호랑)"),
        date: z.string().optional().describe("YYYY-MM-DD. 생략 시 오늘(KST)"),
        meal: z.string().optional().describe("끼니 id 또는 이름 (breakfast, lunch, 아침, 중식 …). 생략 시 전 끼니"),
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
    "search_food",
    {
      description:
        "메뉴 이름으로 과거 급식 사진을 찾습니다. list_providers에서 features.foodSearch가 true인 프로바이더만 지원해요.",
      inputSchema: z.object({
        food: z.string().describe("메뉴 이름 (예: 김치전)"),
        provider: z
          .string()
          .optional()
          .describe("프로바이더 id 또는 이름. 생략 시 foodSearch를 지원하는 첫 프로바이더"),
      }),
    },
    async ({ food, provider }) => {
      const query = food.trim();
      if (!query) {
        return errorResult("food(메뉴 이름)를 입력해 주세요.");
      }

      const searchable = sources.filter((source) => source.searchFood);
      if (searchable.length === 0) {
        return errorResult("메뉴 검색을 지원하는 프로바이더가 없어요.");
      }

      const target = provider
        ? resolveProvider(sources.map(asResolvable), provider)
        : { ok: true as const, value: asResolvable(searchable[0]) };

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
      description: "등록된 프로바이더 카탈로그",
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
      description: "프로바이더·날짜별 식단. date는 YYYY-MM-DD.",
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
