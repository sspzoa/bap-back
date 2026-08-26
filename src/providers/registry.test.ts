import { describe, expect, test } from "bun:test";
import type { MongoDBService } from "@/core/mongodb";
import { ProviderRegistry } from "@/providers/registry";
import type { MealProvider, ProviderConfig } from "@/providers/types";

function fakeProvider(id: string, basePath: string): MealProvider {
  const config: ProviderConfig = {
    id,
    name: id,
    basePath,
    dbName: id,
    collection: "meal_data",
    schedule: [],
    presentation: {
      id,
      name: id,
      schoolName: id,
      basePath,
      description: id,
      keywords: [],
      features: { foodSearch: false },
      meals: [],
    },
  };

  return {
    config,
    db: {} as MongoDBService,
    init: async () => {},
    shutdown: async () => {},
    getMealData: async () => ({ meals: [] }),
    getStats: async () => ({ totalMealData: 0, lastUpdated: null }),
    runRefresh: async () => {},
  };
}

describe("ProviderRegistry path matching", () => {
  function registry() {
    const reg = new ProviderRegistry();
    reg.register(fakeProvider("kdmhs", "/kdmhs"));
    reg.register(fakeProvider("dgu", "/dgu"));
    return reg;
  }

  test("finds a provider by id", () => {
    const reg = registry();
    expect(reg.findById("kdmhs")?.config.id).toBe("kdmhs");
    expect(reg.findById("missing")).toBeUndefined();
  });

  test("matches each provider only by its own basePath", () => {
    const reg = registry();
    expect(reg.findByPath("/kdmhs/2026-08-20")?.config.id).toBe("kdmhs");
    expect(reg.findByPath("/kdmhs/health")?.config.id).toBe("kdmhs");
    expect(reg.findByPath("/kdmhs/search/김치전")?.config.id).toBe("kdmhs");
    expect(reg.findByPath("/dgu/2026-08-20")?.config.id).toBe("dgu");
    expect(reg.findByPath("/dgu/health")?.config.id).toBe("dgu");
  });

  test("does not treat root paths as a default provider", () => {
    const reg = registry();
    expect(reg.findByPath("/2026-08-20")).toBeUndefined();
    expect(reg.findByPath("/health")).toBeUndefined();
    expect(reg.findByPath("/search/김치전")).toBeUndefined();
  });

  test("strips the matching prefix from subPath", () => {
    const reg = registry();
    const kdmhs = reg.findByPath("/kdmhs/2026-08-20");
    const dgu = reg.findByPath("/dgu/2026-08-20");
    if (!kdmhs || !dgu) {
      throw new Error("expected providers");
    }

    expect(reg.getSubPath(kdmhs, "/kdmhs/2026-08-20")).toBe("/2026-08-20");
    expect(reg.getSubPath(kdmhs, "/kdmhs/search/김치전")).toBe("/search/김치전");
    expect(reg.getSubPath(kdmhs, "/kdmhs")).toBe("/");
    expect(reg.getSubPath(dgu, "/dgu/health")).toBe("/health");
  });
});
