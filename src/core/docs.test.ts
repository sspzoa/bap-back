import { describe, expect, test } from "bun:test";
import { buildOpenApiDocument, renderScalarHtml } from "@/core/docs";
import { MEAL_ERROR_MESSAGES } from "@/core/mealErrors";
import type { SitePresentation } from "@/core/types";

const sampleProviders: SitePresentation[] = [
  {
    id: "kdmhs",
    name: "디미고 급식",
    schoolName: "한국디지털미디어고등학교",
    basePath: "/kdmhs",
    description: "test",
    keywords: [],
    features: { foodSearch: true },
    meals: [{ id: "lunch", title: "점심", operatingHours: null, icon: "", background: "", activeUntilHour: 14 }],
  },
  {
    id: "dgu",
    name: "D-Flex",
    schoolName: "동국대",
    basePath: "/dgu",
    description: "test",
    keywords: [],
    features: { foodSearch: false },
    meals: [{ id: "lunch", title: "중식", operatingHours: null, icon: "", background: "", activeUntilHour: 14 }],
  },
];

describe("buildOpenApiDocument", () => {
  test("describes catalog, meals, search, health, and mcp", () => {
    const spec = buildOpenApiDocument(sampleProviders, "https://api.test", "2026-08-25");

    expect(spec.openapi).toBe("3.1.0");
    expect(spec.servers[0].url).toBe("https://api.test");
    expect(spec.paths["/"]).toBeDefined();
    expect(spec.paths["/changelog"]).toBeDefined();
    expect(spec.paths["/{provider}/{date}"]).toBeDefined();
    expect(spec.paths["/{provider}/search/{food}"]).toBeDefined();
    expect(spec.paths["/{provider}/health"]).toBeDefined();
    expect(spec.paths["/mcp"]).toBeDefined();
    expect(spec.components.schemas.PublicDayMenu).toBeDefined();
    expect(spec.components.schemas.SitePresentation).toBeDefined();
    expect(JSON.stringify(spec)).toContain(MEAL_ERROR_MESSAGES.noMealData);
    expect(JSON.stringify(spec)).toContain(MEAL_ERROR_MESSAGES.noMealOperation);
  });

  test("uses registered provider ids as path enums", () => {
    const spec = buildOpenApiDocument(sampleProviders, "https://api.test", "2026-08-25");
    const meals = spec.paths["/{provider}/{date}"] as {
      get: { parameters: { name: string; schema: { enum?: string[]; example?: string } }[] };
    };
    const providerParam = meals.get.parameters.find((parameter) => parameter.name === "provider");

    expect(providerParam?.schema.enum).toEqual(["kdmhs", "dgu"]);
    expect(providerParam?.schema.example).toBe("kdmhs");
  });
});

describe("renderScalarHtml", () => {
  test("embeds the spec url", () => {
    const html = renderScalarHtml("/docs/openapi.json");

    expect(html).toContain("@scalar/api-reference");
    expect(html).toContain("Scalar.createApiReference");
    expect(html).toContain("/docs/openapi.json");
  });
});
