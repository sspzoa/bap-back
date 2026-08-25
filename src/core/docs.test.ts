import { describe, expect, test } from "bun:test";
import { buildApiDocs } from "@/core/docs";
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

describe("buildApiDocs", () => {
  test("includes catalog and meal endpoints with curl examples", () => {
    const docs = buildApiDocs(sampleProviders, "https://api.test", "2026-08-25");

    expect(docs.baseUrl).toBe("https://api.test");
    expect(docs.endpoints.find((e) => e.id === "catalog")?.curls[0]).toContain("https://api.test/");
    expect(docs.endpoints.find((e) => e.id === "meals")?.curls).toEqual([
      "curl https://api.test/kdmhs/2026-08-25",
      "curl https://api.test/dgu/2026-08-25",
    ]);
    expect(docs.endpoints.find((e) => e.id === "search")?.curls[0]).toContain("/kdmhs/search/");
    expect(docs.endpoints.find((e) => e.id === "mcp")).toMatchObject({
      method: "POST",
      path: "/mcp",
    });
    expect(docs.endpoints.find((e) => e.id === "mcp")?.curls[0]).toContain("https://api.test/mcp");
    expect(docs.subtitle).toContain("카탈로그");
    expect(docs.subtitle).toContain("통일 식단 스키마");
    expect(docs.toc.map((item) => item.id)).toContain("adding-provider");
    expect(docs.guides[0]).toMatchObject({ id: "adding-provider" });
    expect(docs.guides[0].steps.length).toBeGreaterThanOrEqual(5);
    expect(docs.typeSchemas.map((schema) => schema.title)).toContain("SitePresentation");
  });

  test("lists error messages from mealErrors", () => {
    const docs = buildApiDocs(sampleProviders, "https://api.test", "2026-08-25");
    const messages = docs.errors.rows.map((row) => row.type);

    expect(messages).toContain("식단 정보가 없어요");
    expect(messages).toContain("식단 운영이 없어요");
  });
});
