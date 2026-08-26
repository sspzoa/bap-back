import { describe, expect, test } from "bun:test";
import { MealNotFoundError } from "@/core/errors";
import type { MongoDBService } from "@/core/mongodb";
import { APP_VERSION } from "@/core/version";
import { createApp } from "@/http/app";
import { ProviderRegistry } from "@/providers/registry";
import type { MealProvider, ProviderConfig } from "@/providers/types";

function fakeProvider(id: string, overrides: Partial<MealProvider> = {}): MealProvider {
  const config: ProviderConfig = {
    id,
    name: id,
    basePath: `/${id}`,
    dbName: id,
    collection: "meal_data",
    schedule: [],
    presentation: {
      id,
      name: id,
      schoolName: id,
      basePath: `/${id}`,
      description: id,
      keywords: [id],
      features: { foodSearch: id === "kdmhs" },
      meals: [{ id: "lunch", title: "점심", operatingHours: null, icon: "", background: "", activeUntilHour: 14 }],
    },
  };

  return {
    config,
    db: {} as MongoDBService,
    init: async () => {},
    shutdown: async () => {},
    getMealData: async () => ({
      meals: [
        {
          id: "lunch",
          title: "점심",
          operatingHours: null,
          kcal: 800,
          image: null,
          groups: [{ id: "regular", label: null, price: null, items: ["밥"] }],
        },
      ],
    }),
    getStats: async () => ({ totalMealData: 3, lastUpdated: new Date("2026-08-25T00:00:00.000Z") }),
    runRefresh: async () => {},
    ...overrides,
  };
}

function testApp(providers: MealProvider[] = [fakeProvider("kdmhs"), fakeProvider("dgu")]) {
  const registry = new ProviderRegistry();
  for (const provider of providers) {
    registry.register(provider);
  }

  return createApp({
    registry,
    mcpHandler: {
      fetch: async (request) => {
        const body = await request.text();
        return new Response(body || "mcp-ok", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  });
}

async function json(app: ReturnType<typeof createApp>, path: string, init?: RequestInit) {
  const response = await app.handle(new Request(`http://localhost${path}`, init));
  return { response, body: await response.json() };
}

describe("Elysia app", () => {
  test("GET / returns the catalog envelope", async () => {
    const { response, body } = await json(testApp(), "/");

    expect(response.status).toBe(200);
    expect(body.message).toBe("api.밥.net");
    expect(body.requestId).toEqual(expect.any(String));
    expect(body.providers.map((site: { id: string }) => site.id)).toEqual(["kdmhs", "dgu"]);
  });

  test("GET /:provider/health returns stats", async () => {
    const { response, body } = await json(testApp(), "/kdmhs/health");

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.database.connected).toBe(true);
    expect(body.database.totalMealData).toBe(3);
    expect(body.database.lastUpdated).toBe("2026-08-25T00:00:00.000Z");
  });

  test("GET /:provider/:date returns the day menu", async () => {
    const { response, body } = await json(testApp(), "/kdmhs/2026-08-25");

    expect(response.status).toBe(200);
    expect(body.date).toBe("2026-08-25");
    expect(body.data.meals[0].groups[0].items).toEqual(["밥"]);
  });

  test("GET /:provider/:date maps domain 404s", async () => {
    const app = testApp([
      fakeProvider("kdmhs", {
        getMealData: async () => {
          throw new MealNotFoundError();
        },
      }),
    ]);
    const { response, body } = await json(app, "/kdmhs/2026-08-25");

    expect(response.status).toBe(404);
    expect(body.error).toBe("식단 정보가 없어요");
  });

  test("GET /:provider/:date rejects an impossible calendar date", async () => {
    const { response, body } = await json(testApp(), "/kdmhs/2026-13-40");

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid date format");
  });

  test("GET /:provider/search/:food uses handleExtraRoute", async () => {
    const app = testApp([
      fakeProvider("kdmhs", {
        handleExtraRoute: async () => ({
          foodName: "김치전",
          matchedMenu: "김치전",
          image: "https://example.com/kimchi.jpg",
          date: "2026-08-20",
          mealType: "lunch",
          section: "regular",
        }),
      }),
    ]);
    const { response, body } = await json(app, "/kdmhs/search/김치전");

    expect(response.status).toBe(200);
    expect(body.foodName).toBe("김치전");
    expect(body.image).toContain("kimchi");
  });

  test("unknown provider is 404", async () => {
    const { response, body } = await json(testApp(), "/missing/health");

    expect(response.status).toBe(404);
    expect(body.error).toBe("Endpoint not found");
  });

  test("GET /changelog returns HTML", async () => {
    const response = await testApp().handle(new Request("http://localhost/changelog"));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("Changelog");
  });

  test("GET /docs serves Scalar and the generated spec", async () => {
    const app = testApp();
    const docs = await app.handle(new Request("http://localhost/docs"));
    const specResponse = await app.handle(new Request("http://localhost/docs/openapi.json"));
    const spec = await specResponse.json();

    expect(docs.status).toBe(200);
    expect(await docs.text()).toMatch(/scalar/i);
    expect(specResponse.status).toBe(200);
    expect(spec.info.title).toBe("밥.net API");
    expect(spec.info.version).toBe(APP_VERSION);
    expect(spec.paths["/"]).toBeDefined();
    expect(spec.paths["/changelog"]).toBeDefined();
    expect(spec.paths["/{provider}/{date}"]).toBeDefined();
    expect(spec.paths["/{provider}/search/{food}"]).toBeDefined();
    expect(spec.paths["/{provider}/health"]).toBeDefined();
    expect(spec.paths["/mcp"]).toBeDefined();
  });

  test("POST /mcp forwards the raw body", async () => {
    const { response, body } = await json(testApp(), "/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"jsonrpc":"2.0"}',
    });

    expect(response.status).toBe(200);
    expect(body).toEqual({ jsonrpc: "2.0" });
  });

  test("CORS reflects an allowed frontend origin", async () => {
    const response = await testApp().handle(
      new Request("http://localhost/", {
        headers: { Origin: "http://localhost:3000" },
      }),
    );

    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
  });

  test("MCP CORS allows any origin", async () => {
    const response = await testApp().handle(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          Origin: "https://example.com",
          "Content-Type": "application/json",
        },
        body: "{}",
      }),
    );

    expect(response.headers.get("access-control-allow-origin")).toBe("https://example.com");
  });
});
