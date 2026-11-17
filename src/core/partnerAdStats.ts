import type { MongoDBService } from "@/core/mongodb";

/** Same cluster and database as 디미고 meal data (`bap`). Not a new database. */
export const PARTNER_AD_DB = "bap";

/** Daily counters. One document per institution, Seoul date, and slot. */
export const PARTNER_AD_COLLECTION = "partner_ad_daily";

export type PartnerAdEventType = "impression" | "click";

export interface PartnerAdDailyEvent {
  siteId: string;
  date: string;
  slot: string;
  type: PartnerAdEventType;
}

export interface PartnerAdDailyUpdate {
  filter: { _id: string };
  update: {
    $inc: { impressions: 1 } | { clicks: 1 };
    $set: { siteId: string; date: string; slot: string; updatedAt: Date };
    $setOnInsert: { createdAt: Date; impressions?: 0; clicks?: 0 };
  };
}

/**
 * Counter document in `bap.partner_ad_daily`:
 *
 * ```
 * {
 *   _id: "kdmhs:2026-11-17:mobile-breakfast",
 *   siteId: "kdmhs",
 *   date: "2026-11-17",
 *   slot: "mobile-breakfast" | "mobile-lunch" | "mobile-dinner" | "pc",
 *   impressions: 0,
 *   clicks: 0,
 *   createdAt: Date,
 *   updatedAt: Date
 * }
 * ```
 *
 * No IP, user agent, or other personal data is stored.
 */
export function partnerAdDailyUpdate(event: PartnerAdDailyEvent, now: Date): PartnerAdDailyUpdate {
  const counter = event.type === "impression" ? { impressions: 1 as const } : { clicks: 1 as const };
  const other = event.type === "impression" ? { clicks: 0 as const } : { impressions: 0 as const };

  return {
    filter: { _id: `${event.siteId}:${event.date}:${event.slot}` },
    update: {
      $inc: counter,
      $set: {
        siteId: event.siteId,
        date: event.date,
        slot: event.slot,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
        ...other,
      },
    },
  };
}

export interface PartnerAdRecorder {
  record(event: PartnerAdDailyEvent): Promise<void>;
}

export class PartnerAdStats {
  constructor(private readonly db: MongoDBService) {}

  private collection() {
    return this.db.getDb().collection(PARTNER_AD_COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    await this.collection().createIndex({ siteId: 1, date: 1 });
  }

  async record(event: PartnerAdDailyEvent, now = new Date()): Promise<void> {
    const { filter, update } = partnerAdDailyUpdate(event, now);
    await this.collection().updateOne(filter, update, { upsert: true });
  }
}
