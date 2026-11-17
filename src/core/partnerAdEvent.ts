import type { PartnerAdDailyEvent, PartnerAdEventType } from "@/core/partnerAdStats";

export interface PartnerAdMeal {
  id: string;
}

export interface PartnerAdDecision {
  status: 204 | 400 | 503;
  event: PartnerAdDailyEvent | null;
  error: string | null;
}

const MAX_BODY_BYTES = 512;

export function seoulDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function isLikelyBot(userAgent: string | null): boolean {
  if (!userAgent || userAgent.trim().length < 12) {
    return true;
  }

  return /bot|crawl|spider|slurp|headless|preview|wget|curl|python-requests|go-http-client|scrapy|httpclient/i.test(
    userAgent,
  );
}

/** `pc` is the desktop leaderboard. Mobile cards are `mobile-<meal id>`. */
export function isPartnerAdSlot(slot: string, meals: readonly PartnerAdMeal[]): boolean {
  if (slot === "pc") {
    return true;
  }

  const prefix = "mobile-";
  if (!slot.startsWith(prefix)) {
    return false;
  }

  const mealId = slot.slice(prefix.length);
  if (!mealId || mealId.length > 32 || mealId.includes("/")) {
    return false;
  }

  return meals.some((meal) => meal.id === mealId);
}

function readBody(raw: string): { siteId: string; slot: string; type: PartnerAdEventType } | null {
  if (raw.length === 0 || raw.length > MAX_BODY_BYTES) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const body = parsed as Record<string, unknown>;
  const siteId = typeof body.siteId === "string" ? body.siteId.trim() : "";
  const slot = typeof body.slot === "string" ? body.slot.trim() : "";
  const type = body.type;
  if (!siteId || !slot || (type !== "impression" && type !== "click")) {
    return null;
  }

  return { siteId, slot, type };
}

/**
 * Accept a browser beacon or drop it.
 * Bots and requests from outside the frontend are ignored with 204 so they are not retried as errors.
 * The caller assigns the Seoul date. The client cannot choose the bucket.
 */
export function decidePartnerAdEvent(input: {
  raw: string;
  origin: string | null;
  userAgent: string | null;
  origins: readonly string[];
  mealsFor: (siteId: string) => readonly PartnerAdMeal[] | null;
  now?: Date;
}): PartnerAdDecision {
  if (!input.origin || !input.origins.includes(input.origin) || isLikelyBot(input.userAgent)) {
    return { status: 204, event: null, error: null };
  }

  const body = readBody(input.raw);
  if (!body) {
    return { status: 400, event: null, error: "Invalid partner ad event" };
  }

  const meals = input.mealsFor(body.siteId);
  if (!meals || !isPartnerAdSlot(body.slot, meals)) {
    return { status: 400, event: null, error: "Invalid partner ad event" };
  }

  return {
    status: 204,
    error: null,
    event: {
      siteId: body.siteId,
      slot: body.slot,
      type: body.type,
      date: seoulDate(input.now ?? new Date()),
    },
  };
}
