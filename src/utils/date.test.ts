import { describe, expect, test } from "bun:test";
import { getWeekDates, isValidDate } from "./date";

describe("isValidDate", () => {
  test("accepts real calendar days", () => {
    expect(isValidDate("2026-08-20")).toBe(true);
    expect(isValidDate("2024-02-29")).toBe(true);
  });

  test("rejects impossible days and bad format", () => {
    expect(isValidDate("2026-02-31")).toBe(false);
    expect(isValidDate("2026-13-01")).toBe(false);
    expect(isValidDate("2026-8-20")).toBe(false);
  });
});

describe("getWeekDates", () => {
  test("returns Monday–Saturday and puts Sunday on the previous week", () => {
    expect(getWeekDates("2026-08-20")).toEqual([
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
    ]);
    expect(getWeekDates("2026-08-16")[0]).toBe("2026-08-10");
    expect(getWeekDates("2026-08-17")[0]).toBe("2026-08-17");
  });
});
