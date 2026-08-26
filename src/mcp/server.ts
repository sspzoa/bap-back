import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { ApiError } from "@/core/errors";
import type { PublicDayMenu, SitePresentation } from "@/core/types";
import { APP_VERSION } from "@/core/version";
import { resolveMeals, resolveProvider } from "@/mcp/resolve";
import type { MealProvider } from "@/providers/types";
import { formatDate, isValidDate } from "@/utils/date";

export const MCP_SERVER_NAME = "밥.net";
export const MCP_SERVER_VERSION = APP_VERSION;

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
        "밥.net turns Korean school, university, and workplace canteen menus into something an agent can read. Use this server whenever the user asks what is being served, wants a meal recommendation, or needs a photo of a dish — even if they never say 밥.net or a school id.",
        "",
        "Keep one-off trivia in chat. Reach for these tools when the answer should cite a real menu.",
        "",
        "When to use which tool:",
        "- bap_list_providers — lock in a canteen id, meal slots, or whether photo search is supported. Call once per session unless the catalog may have changed.",
        "- bap_get_meals — the default tool for a day's (or one slot's) menu text, corners, prices, kcal, and plated photos when the provider has them.",
        "- bap_search_food — archive image search by dish name. Not today's menu list.",
        "",
        "How to use well:",
        "- Timezone is always Asia/Seoul (KST). Convert '오늘/내일' and weekdays to YYYY-MM-DD before calling. Never send those words as date, and never invent a date.",
        "- provider accepts an id (kdmhs, dgu, horang) or a name/keyword (디미고, 동국대, 호랑). If several places match, list providers and retry with the id. Do not guess.",
        "- One canteen and one calendar day per call. For a range, call once per date.",
        "",
        `Registered providers: ${catalog}`,
      ].join("\n"),
    },
  );

  server.registerTool(
    MCP_TOOLS.listProviders,
    {
      title: "밥.net 등록된 식당 목록",
      description: [
        "등록된 학교·대학·구내식당(프로바이더) 카탈로그를 반환합니다. 이름, 끼니 슬롯, 운영시간, 사진검색 지원 여부만 있고 실제 메뉴 항목은 없습니다. 식단 질의 전에 provider id를 확정할 때 쓰는 기본 도구입니다.",
        "",
        "When to use this vs other tools:",
        "- Use this when the school/canteen id is unclear, or you need meal slots (아침·중식·석식) or whether photo search is supported.",
        "- Use bap_get_meals when you need the actual menu items for a date.",
        "- Use bap_search_food when you need a past meal photo, not today's menu text.",
        "",
        "How to use well:",
        "- Call once to lock in an id, then pass that id to bap_get_meals / bap_search_food. Do not re-call in the same session if you already have the catalog.",
        "- If the user named a school in Korean (디미고, 동국대, 호랑), still start here when you are not sure which id to send.",
        "",
        "Returns JSON { providers: [{ id, name, schoolName, basePath, description, features.foodSearch, meals: [{ id, title, operatingHours, activeUntilHour }] }] }",
        `Currently registered: ${catalog}`,
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
        "한 식당의 하루 식단을 가져옵니다. 메뉴 항목, 코너, 가격, 있으면 칼로리·사진까지 포함합니다. 식단 질의의 기본 도구입니다. 오늘 메뉴가 아니라 과거에 나온 메뉴 사진을 찾는 도구가 아닙니다.",
        "",
        "When to use this vs other tools:",
        "- Use this for concrete menus: '오늘 디미고 점심', '동국대 석식', '호랑 내일 메뉴'.",
        "- Use bap_list_providers first when the provider id is unknown or several places could match.",
        "- Use bap_search_food when the user wants a photo of a dish ('김치전 사진', '이거 어떻게 생겼어'), not today's item list.",
        "",
        "How to use well:",
        "- One canteen and one calendar day per call. For a date range, call once per date.",
        "- Convert relative days ('오늘', '내일', '월요일') to YYYY-MM-DD in Asia/Seoul before calling. Do not guess a date string. Omit date to mean today (KST).",
        "- Pass meal only when the user asked for a single slot. Slot id or title fragment: breakfast, lunch, dinner, 아침, 점심, 중식, 저녁, 석식. Omit to return every meal that day.",
        "- Prefer a catalog id (kdmhs, dgu, horang) over a nickname once you have it.",
        "",
        "Provider shapes:",
        "- Cafeteria (kdmhs): groups are regular / plus(플러스바) / simple(간편식). kcal and image may be present.",
        "- Corner (dgu, horang): groups are corner names with price (KRW). kcal and image are usually null.",
        "",
        "Errors:",
        "- Provider not found or ambiguous → call bap_list_providers, then retry with the id.",
        "- Invalid date → not YYYY-MM-DD.",
        "- '식단 정보가 없어요' → outside stored range.",
        "- '식단 운영이 없어요' → in range but closed / not posted (방학·휴무).",
        "",
        "Returns JSON { provider: { id, name, schoolName }, date, meals: [{ id, title, operatingHours, kcal, image, groups: [{ id, label, price, items }] }] }",
        "",
        '<example description="오늘 디미고 점심">{"provider":"kdmhs","meal":"lunch"}</example>',
        '<example description="동국대 내일 석식">{"provider":"dgu","date":"YYYY-MM-DD","meal":"dinner"}</example>',
        `Currently registered: ${catalog}`,
      ].join("\n"),
      annotations: READ_ONLY,
      inputSchema: z.object({
        provider: z
          .string()
          .min(1)
          .describe(
            "Canteen id or name/keyword. Prefer a catalog id once known: kdmhs, dgu, horang. Korean aliases also work (디미고, 동국대, 호랑). If several places match, do not guess — list providers and retry with the id. Do not pass an empty string.",
          ),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
          .optional()
          .describe(
            "Calendar date as YYYY-MM-DD in Asia/Seoul. Omit for today. Convert '오늘/내일' yourself before calling — never send those words, and never invent a date. Relative weekdays must be resolved in KST first.",
          ),
        meal: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Optional single-slot filter. Accepts slot id or a title fragment: breakfast, lunch, dinner, 아침, 점심, 중식, 저녁, 석식. Omit to return every meal that day. Do not invent a slot that is not in the catalog.",
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
        "메뉴 이름으로 과거에 나온 급식 사진을 찾습니다. 가장 최근 매칭의 날짜·끼니·이미지 URL을 반환합니다. 오늘의 식단 목록이 아니라 아카이브 이미지 검색입니다. Partial match on the menu name.",
        "",
        "When to use this vs other tools:",
        "- Use this when the user wants a photo: '김치전 사진', '이 메뉴 어떻게 생겼어', '예전에 나온 돈가스'.",
        "- Use bap_get_meals for today's (or any day's) menu text, calories, corners, and prices.",
        "- Use bap_list_providers to see which canteens have features.foodSearch before searching.",
        "",
        "How to use well:",
        "- One dish name per call. Keep food short (김치전, 돈가스) — not a full sentence.",
        `- Only works when features.foodSearch is true. Photo search available: ${searchable}. Passing an unsupported canteen returns an error.`,
        "- Omit provider to use the first foodSearch-capable canteen. Prefer an explicit id when the user named a school.",
        "",
        "Errors: menu not found; provider does not support search.",
        "",
        "Returns JSON { foodName, matchedMenu, image, date, mealType, section }. section is kdmhs-only: regular | plus | simple.",
        "",
        '<example description="김치전 사진">{"food":"김치전","provider":"kdmhs"}</example>',
        `Currently registered: ${catalog}`,
      ].join("\n"),
      annotations: READ_ONLY,
      inputSchema: z.object({
        food: z
          .string()
          .min(1)
          .describe(
            "Dish name to look up, preferably a short noun (김치전, 돈가스). Partial match. Do not pass a full question or whitespace-only string.",
          ),
        provider: z
          .string()
          .min(1)
          .optional()
          .describe(
            `Canteen id or name that supports photo search. Omit to use the first foodSearch provider (${searchable || "none"}). Do not pass a canteen that does not support search — list providers first if unsure.`,
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
      description: `Same catalog JSON as bap_list_providers — canteen metadata and meal slots, not daily menus. Read this to lock in an id before fetching meals. Currently: ${catalog}`,
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
        "Same daily menu JSON as bap_get_meals. URI is bap://meals/{provider}/{date}. date must be YYYY-MM-DD (KST). provider is an id or name. Convert '오늘/내일' before building the URI — do not put those words in the path.",
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
