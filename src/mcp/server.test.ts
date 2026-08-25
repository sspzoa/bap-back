import { afterEach, describe, expect, test } from "bun:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { MealNotFoundError } from "@/core/errors";
import type { PublicDayMenu, SitePresentation } from "@/core/types";
import { createBapMcpHandler } from "@/mcp/handler";
import type { McpMealSource } from "@/mcp/server";

function presentation(id: string, name: string, schoolName: string, foodSearch: boolean): SitePresentation {
  return {
    id,
    name,
    schoolName,
    basePath: `/${id}`,
    description: name,
    keywords: [name],
    features: { foodSearch },
    meals: [{ id: "lunch", title: "점심", operatingHours: null, icon: "", background: "", activeUntilHour: 14 }],
  };
}

const lunchMenu: PublicDayMenu = {
  meals: [
    {
      id: "lunch",
      title: "점심",
      operatingHours: null,
      kcal: 800,
      image: null,
      groups: [{ id: "regular", label: null, price: null, items: ["흰쌀밥", "김치찌개"] }],
    },
  ],
};

const sources: McpMealSource[] = [
  {
    id: "kdmhs",
    presentation: presentation("kdmhs", "디미고 급식", "한국디지털미디어고등학교", true),
    async getMealData(date) {
      if (date === "2026-08-25") {
        return lunchMenu;
      }
      throw new MealNotFoundError();
    },
    async searchFood(food) {
      if (food === "김치전") {
        return {
          foodName: food,
          matchedMenu: "김치전",
          image: "https://img.example/kimchi",
          date: "2026-08-20",
          mealType: "lunch",
          section: "regular",
        };
      }
      return null;
    },
  },
  {
    id: "dgu",
    presentation: presentation("dgu", "D-Flex", "동국대학교", false),
    async getMealData() {
      return { meals: [] };
    },
  },
];

const handler = createBapMcpHandler({ sources, today: () => "2026-08-25" });

async function connectClient() {
  const transport = new StreamableHTTPClientTransport(new URL("http://test.local/mcp"), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  });
  const client = new Client({ name: "test", version: "1.0.0" }, { versionNegotiation: { mode: "auto" } });
  await client.connect(transport);
  return client;
}

function textOf(result: { content: { type: string; text?: string }[] }): string {
  const block = result.content.find((item) => item.type === "text");
  return block && "text" in block ? (block.text ?? "") : "";
}

describe("밥.net MCP", () => {
  const clients: Awaited<ReturnType<typeof connectClient>>[] = [];

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
  });

  async function client() {
    const connected = await connectClient();
    clients.push(connected);
    return connected;
  }

  test("lists meal tools", async () => {
    const mcp = await client();
    const listed = await mcp.listTools();
    expect(listed.tools.map((tool) => tool.name).sort()).toEqual(["get_meals", "list_providers", "search_food"]);
  });

  test("list_providers returns catalog entries", async () => {
    const mcp = await client();
    const result = await mcp.callTool({ name: "list_providers", arguments: {} });
    const body = JSON.parse(textOf(result));
    expect(body.providers.map((provider: { id: string }) => provider.id)).toEqual(["kdmhs", "dgu"]);
    expect(body.providers[0].features.foodSearch).toBe(true);
  });

  test("get_meals resolves a Korean name and defaults to today", async () => {
    const mcp = await client();
    const result = await mcp.callTool({ name: "get_meals", arguments: { provider: "디미고" } });
    const body = JSON.parse(textOf(result));
    expect(body.date).toBe("2026-08-25");
    expect(body.meals[0].groups[0].items).toContain("흰쌀밥");
  });

  test("get_meals surfaces domain 404s", async () => {
    const mcp = await client();
    const result = await mcp.callTool({ name: "get_meals", arguments: { provider: "kdmhs", date: "2020-01-01" } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe("식단 정보가 없어요");
  });

  test("search_food finds a past menu photo", async () => {
    const mcp = await client();
    const result = await mcp.callTool({ name: "search_food", arguments: { food: "김치전" } });
    const body = JSON.parse(textOf(result));
    expect(body.image).toBe("https://img.example/kimchi");
  });

  test("search_food rejects providers without foodSearch", async () => {
    const mcp = await client();
    const result = await mcp.callTool({ name: "search_food", arguments: { food: "김치전", provider: "dgu" } });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("지원하지 않");
  });
});
