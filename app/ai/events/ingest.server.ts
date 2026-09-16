import { randomUUID } from "node:crypto";
import db from "../../db.server";
import {
  allowsAnalyticsPersistence,
  parseShopperEventEnvelope,
  toShopperEventCreateData,
  type ShopperEventName,
} from "./envelope";
import { recordIdentitySighting } from "./identity.server";
import { getShopPrivacySettings } from "../../models/shopPrivacy.server";

export const AI_EVENTS_BATCH_MAX = 25;

export const AI_EVENTS_INGEST_NAMES = [
  "recommendation_view",
  "recommendation_click",
  "recommendation_add",
  "recommendation_purchase",
  "add_to_cart",
  "remove_from_cart",
  "quantity_change",
  "cart_view",
] as const satisfies readonly ShopperEventName[];

const INGEST_NAME_SET = new Set<string>(AI_EVENTS_INGEST_NAMES);

export type IngestSkipReason = "consent" | "invalid" | "name";

export interface IngestBatchResult {
  accepted: number;
  skipped: Record<IngestSkipReason, number>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compactRecord(value: unknown): Record<string, unknown> | undefined {
  if (!isPlainObject(value)) return undefined;
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry == null || entry === "") continue;
    next[key] = entry;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

export async function ingestShopperEventBatch(input: {
  shop: string;
  consented?: boolean;
  events: unknown;
}): Promise<IngestBatchResult> {
  const skipped: Record<IngestSkipReason, number> = {
    consent: 0,
    invalid: 0,
    name: 0,
  };

  const eventCount = Array.isArray(input.events) ? Math.min(input.events.length, AI_EVENTS_BATCH_MAX) : 0;
  if (input.consented === false) {
    skipped.consent = eventCount;
    return { accepted: 0, skipped };
  }

  const privacy = await getShopPrivacySettings(input.shop);
  if (!privacy.trackingEnabled) {
    skipped.consent = eventCount;
    return { accepted: 0, skipped };
  }

  if (!Array.isArray(input.events)) {
    return { accepted: 0, skipped };
  }

  const rows: ReturnType<typeof toShopperEventCreateData>[] = [];

  for (const raw of input.events.slice(0, AI_EVENTS_BATCH_MAX)) {
    if (!isPlainObject(raw)) {
      skipped.invalid += 1;
      continue;
    }

    const name = typeof raw.name === "string" ? raw.name : "";
    if (!INGEST_NAME_SET.has(name)) {
      skipped.name += 1;
      continue;
    }

    const consent = isPlainObject(raw.consent)
      ? raw.consent
      : { analytics: input.consented !== false, marketing: false };

    const parsed = parseShopperEventEnvelope({
      schemaVersion: 1,
      shop: input.shop,
      eventId: typeof raw.eventId === "string" && raw.eventId.trim() ? raw.eventId : randomUUID(),
      occurredAt: raw.occurredAt ?? new Date().toISOString(),
      sessionId: raw.sessionId,
      customerId: raw.customerId,
      anonId: raw.anonId,
      consent,
      name,
      source: raw.source ?? "ai_events",
      surface: raw.surface ?? "theme_block",
      entities: compactRecord(raw.entities),
      context: compactRecord(raw.context),
      attribution: compactRecord(raw.attribution),
    });

    if (!parsed.ok) {
      skipped.invalid += 1;
      continue;
    }
    if (!allowsAnalyticsPersistence(parsed.data)) {
      skipped.consent += 1;
      continue;
    }

    rows.push(toShopperEventCreateData(parsed.data));
  }

  if (rows.length === 0) {
    return { accepted: 0, skipped };
  }

  const result = await db.shopperEvent.createMany({
    data: rows,
    skipDuplicates: true,
  });

  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${row.sessionId ?? ""}|${row.anonId ?? ""}|${row.customerId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await recordIdentitySighting({
      shop: input.shop,
      sessionId: row.sessionId,
      anonId: row.anonId,
      customerId: row.customerId,
      source: "ai_events",
    });
  }

  return { accepted: result.count, skipped };
}
