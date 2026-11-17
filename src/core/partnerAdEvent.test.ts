import { describe, expect, test } from "bun:test";
import { decidePartnerAdEvent, isLikelyBot, seoulDate } from "@/core/partnerAdEvent";
import { partnerAdDailyUpdate } from "@/core/partnerAdStats";

const origins = ["https://xn--rh3b.net", "https://밥.net"];
const meals = [{ id: "breakfast" }, { id: "lunch" }, { id: "dinner" }];
const browser = "Mozilla/5.0 (compatible; bap-web)";

function decide(raw: string, extra: Partial<Parameters<typeof decidePartnerAdEvent>[0]> = {}) {
  return decidePartnerAdEvent({
    raw,
    origin: "https://xn--rh3b.net",
    userAgent: browser,
    origins,
    mealsFor: (siteId) => (siteId === "kdmhs" ? meals : null),
    now: new Date("2026-11-16T15:30:00.000Z"),
    ...extra,
  });
}

describe("seoulDate", () => {
  test("uses the Asia/Seoul calendar day", () => {
    expect(seoulDate(new Date("2026-11-16T14:30:00.000Z"))).toBe("2026-11-16");
    expect(seoulDate(new Date("2026-11-16T15:30:00.000Z"))).toBe("2026-11-17");
  });
});

describe("decidePartnerAdEvent", () => {
  test("records a meal-card impression on the Seoul date", () => {
    const decision = decide(JSON.stringify({ siteId: "kdmhs", slot: "mobile-breakfast", type: "impression" }));

    expect(decision).toEqual({
      status: 204,
      error: null,
      event: { siteId: "kdmhs", date: "2026-11-17", slot: "mobile-breakfast", type: "impression" },
    });
  });

  test("accepts the desktop slot and the other meal cards", () => {
    expect(decide(JSON.stringify({ siteId: "kdmhs", slot: "pc", type: "click" })).event?.slot).toBe("pc");
    expect(decide(JSON.stringify({ siteId: "kdmhs", slot: "mobile-dinner", type: "click" })).event?.slot).toBe(
      "mobile-dinner",
    );
  });

  test("drops bots and foreign origins without an error", () => {
    const body = JSON.stringify({ siteId: "kdmhs", slot: "pc", type: "click" });

    expect(decide(body, { userAgent: "curl/8.0" })).toEqual({ status: 204, event: null, error: null });
    expect(decide(body, { origin: "https://evil.example" })).toEqual({ status: 204, event: null, error: null });
    expect(decide(body, { origin: null })).toEqual({ status: 204, event: null, error: null });
    expect(isLikelyBot("")).toBe(true);
  });

  test("rejects unknown schools, slots, and bodies", () => {
    expect(decide(JSON.stringify({ siteId: "nope", slot: "pc", type: "click" })).status).toBe(400);
    expect(decide(JSON.stringify({ siteId: "kdmhs", slot: "mobile-brunch", type: "click" })).status).toBe(400);
    expect(decide("not-json").status).toBe(400);
    expect(decide(JSON.stringify({ siteId: "kdmhs", slot: "pc", type: "view" })).status).toBe(400);
  });
});

describe("partnerAdDailyUpdate", () => {
  test("increments one daily counter and does not store personal data", () => {
    const now = new Date("2026-11-17T00:30:00.000Z");
    const { filter, update } = partnerAdDailyUpdate(
      { siteId: "kdmhs", date: "2026-11-17", slot: "mobile-lunch", type: "click" },
      now,
    );

    expect(filter).toEqual({ _id: "kdmhs:2026-11-17:mobile-lunch" });
    expect(update.$inc).toEqual({ clicks: 1 });
    expect(update.$set).toEqual({
      siteId: "kdmhs",
      date: "2026-11-17",
      slot: "mobile-lunch",
      updatedAt: now,
    });
    expect(update.$setOnInsert).toEqual({ createdAt: now, impressions: 0 });
    expect(JSON.stringify({ filter, update })).not.toMatch(/ip|userAgent|cookie/i);
  });
});
