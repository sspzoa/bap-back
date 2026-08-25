import { describe, expect, test } from "bun:test";
import type { PublicMeal } from "@/core/types";
import { resolveMeals, resolveProvider } from "@/mcp/resolve";

const providers = [
  {
    id: "kdmhs",
    name: "디미고 급식",
    schoolName: "한국디지털미디어고등학교",
    basePath: "/kdmhs",
    keywords: ["디미고", "급식"],
  },
  {
    id: "dgu",
    name: "D-Flex",
    schoolName: "동국대학교",
    basePath: "/dgu",
    keywords: ["동국대"],
  },
];

const meals: PublicMeal[] = [
  { id: "lunch", title: "중식", operatingHours: null, kcal: null, image: null, groups: [] },
  { id: "dinner", title: "석식", operatingHours: null, kcal: null, image: null, groups: [] },
];

describe("resolveProvider", () => {
  test("matches id, name, and keywords", () => {
    expect(resolveProvider(providers, "kdmhs")).toEqual({ ok: true, value: providers[0] });
    expect(resolveProvider(providers, "디미고")).toEqual({ ok: true, value: providers[0] });
    expect(resolveProvider(providers, "/dgu")).toEqual({ ok: true, value: providers[1] });
    expect(resolveProvider(providers, "동국")).toEqual({ ok: true, value: providers[1] });
  });

  test("rejects empty and unknown queries", () => {
    expect(resolveProvider(providers, "  ").ok).toBe(false);
    expect(resolveProvider(providers, "없는학교").ok).toBe(false);
  });

  test("asks for an id when the query is ambiguous", () => {
    const result = resolveProvider(providers, "학교");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("kdmhs");
      expect(result.message).toContain("dgu");
    }
  });
});

describe("resolveMeals", () => {
  test("returns all meals when query is omitted", () => {
    expect(resolveMeals(meals).value).toEqual(meals);
  });

  test("filters by id or title", () => {
    expect(resolveMeals(meals, "lunch").value).toEqual([meals[0]]);
    expect(resolveMeals(meals, "석").value).toEqual([meals[1]]);
  });

  test("errors when no meal matches", () => {
    const result = resolveMeals(meals, "breakfast");
    expect(result.ok).toBe(false);
  });
});
