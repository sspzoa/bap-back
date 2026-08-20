import { describe, expect, test } from "bun:test";
import type { MongoDBService } from "@/core/mongodb";
import { ProviderRegistry } from "@/providers/registry";
import type { MealProvider, ProviderConfig } from "@/providers/types";

function fakeProvider(id: string, basePath: string, aliases?: string[]): MealProvider {
  const config: ProviderConfig = {
    id,
    name: id,
    basePath,
    aliases,
    origins: [],
    dbName: id,
    collection: "meal_data",
    schedule: [],
  };

  return {
    config,
    db: {} as MongoDBService,
    init: async () => {},
    shutdown: async () => {},
    getMealData: async () => ({}),
    refreshMealData: async () => ({}),
    getStats: async () => ({ totalMealData: 0, lastUpdated: null }),
    runRefresh: async () => {},
  };
}

describe("ProviderRegistry path matching", () => {
  function registry() {
    const reg = new ProviderRegistry();
    reg.register(fakeProvider("kdmhs", "/kdmhs", [""]));
    reg.register(fakeProvider("dgu", "/dgu"));
    return reg;
  }

  test("matches /kdmhs prefix and empty alias to KDMHS", () => {
    const reg = registry();
    expect(reg.findByPath("/kdmhs/2026-08-20")?.config.id).toBe("kdmhs");
    expect(reg.findByPath("/kdmhs/health")?.config.id).toBe("kdmhs");
    expect(reg.findByPath("/kdmhs/search/김치전")?.config.id).toBe("kdmhs");
    expect(reg.findByPath("/2026-08-20")?.config.id).toBe("kdmhs");
    expect(reg.findByPath("/health")?.config.id).toBe("kdmhs");
    expect(reg.findByPath("/search/김치전")?.config.id).toBe("kdmhs");
  });

  test("matches /dgu prefix to DGU and does not steal kdmhs paths", () => {
    const reg = registry();
    expect(reg.findByPath("/dgu/2026-08-20")?.config.id).toBe("dgu");
    expect(reg.findByPath("/dgu/health")?.config.id).toBe("dgu");
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
    expect(reg.getSubPath(kdmhs, "/2026-08-20")).toBe("/2026-08-20");
    expect(reg.getSubPath(kdmhs, "/kdmhs")).toBe("/");
    expect(reg.getSubPath(dgu, "/dgu/health")).toBe("/health");
  });
});
