/**
 * Version 1 shopper event envelope (AI-1.2).
 * Ingest/dual-write is AI-1.3+; this module only types, Zod, and Prisma row mapping.
 */

import { z } from "zod";

export const SHOPPER_EVENT_SCHEMA_VERSION = 1 as const;

export const SHOPPER_EVENT_NAMES = [
  "page_view",
  "product_view",
  "product_search",
  "collection_view",
  "product_click",
  "variant_select",
  "image_view",
  "size_select",
  "add_to_cart",
  "remove_from_cart",
  "quantity_change",
  "cart_view",
  "checkout_started",
  "checkout_completed",
  "purchase",
  "popup_view",
  "popup_close",
  "recommendation_view",
  "recommendation_click",
  "recommendation_add",
  "recommendation_purchase",
  "offer_view",
  "offer_accept",
  "offer_reject",
  "wishlist_add",
] as const;

export type ShopperEventName = (typeof SHOPPER_EVENT_NAMES)[number];

export const SHOPPER_EVENT_SURFACES = [
  "theme_block",
  "pixel",
  "checkout_ui",
  "post_purchase",
  "admin",
] as const;

export type ShopperEventSurface = (typeof SHOPPER_EVENT_SURFACES)[number];

const opaqueId = z.string().trim().min(1).max(255);

const consentSchema = z
  .object({
    analytics: z.boolean(),
    marketing: z.boolean(),
  })
  .strict();

const entitiesSchema = z
  .object({
    productId: opaqueId.optional(),
    variantId: opaqueId.optional(),
    collectionId: opaqueId.optional(),
    query: z.string().trim().max(500).optional(),
  })
  .strict();

const contextSchema = z
  .object({
    cartValue: z.number().finite().nonnegative().optional(),
    currency: z.string().trim().min(1).max(8).optional(),
    path: z.string().trim().max(2000).optional(),
  })
  .strict();

const attributionSchema = z
  .object({
    campaignId: opaqueId.nullable().optional(),
    experienceId: opaqueId.nullable().optional(),
    recommendationId: opaqueId.nullable().optional(),
  })
  .strict();

export const shopperEventEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(SHOPPER_EVENT_SCHEMA_VERSION),
    shop: z.string().trim().min(1).max(255),
    eventId: opaqueId,
    occurredAt: z.coerce.date(),
    sessionId: opaqueId.nullable().optional(),
    customerId: opaqueId.nullable().optional(),
    anonId: opaqueId.nullable().optional(),
    consent: consentSchema,
    name: z.enum(SHOPPER_EVENT_NAMES),
    source: z.string().trim().min(1).max(100).optional(),
    surface: z.enum(SHOPPER_EVENT_SURFACES),
    entities: entitiesSchema.optional(),
    context: contextSchema.optional(),
    attribution: attributionSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const sessionId = emptyToNull(value.sessionId);
    const customerId = emptyToNull(value.customerId);
    const anonId = emptyToNull(value.anonId);
    if (!sessionId && !customerId && !anonId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one of sessionId, customerId, or anonId is required",
        path: ["sessionId"],
      });
    }
  });

export type ShopperEventEnvelope = z.infer<typeof shopperEventEnvelopeSchema>;

export type EnvelopeParseResult =
  | { ok: true; data: ShopperEventEnvelope }
  | { ok: false; error: string; issues?: z.ZodIssue[] };

const PII_KEYS = new Set([
  "email",
  "phone",
  "ip",
  "ipAddress",
  "firstName",
  "lastName",
  "fullName",
  "displayName",
  "address",
]);

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hasForbiddenPiiKeys(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.keys(value).some((key) => PII_KEYS.has(key));
}

export function parseShopperEventEnvelope(input: unknown): EnvelopeParseResult {
  if (hasForbiddenPiiKeys(input)) {
    return { ok: false, error: "Envelope must not include personally identifiable fields" };
  }

  const parsed = shopperEventEnvelopeSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path?.length ? first.path.join(".") : "envelope";
    return {
      ok: false,
      error: `${path}: ${first?.message ?? "Invalid shopper event envelope"}`,
      issues: parsed.error.issues,
    };
  }

  const data = parsed.data;
  return {
    ok: true,
    data: {
      ...data,
      sessionId: emptyToNull(data.sessionId) ?? undefined,
      customerId: emptyToNull(data.customerId) ?? undefined,
      anonId: emptyToNull(data.anonId) ?? undefined,
    },
  };
}

export function allowsAnalyticsPersistence(envelope: ShopperEventEnvelope): boolean {
  return envelope.consent.analytics === true;
}

/** Column mapping for `ShopperEvent` create — no database I/O. */
export function toShopperEventCreateData(envelope: ShopperEventEnvelope) {
  const entities = envelope.entities;
  const attribution = envelope.attribution;
  return {
    shop: envelope.shop,
    eventId: envelope.eventId,
    schemaVersion: envelope.schemaVersion,
    name: envelope.name,
    source: envelope.source ?? null,
    surface: envelope.surface,
    sessionId: envelope.sessionId ?? null,
    customerId: envelope.customerId ?? null,
    anonId: envelope.anonId ?? null,
    consentAnalytics: envelope.consent.analytics,
    consentMarketing: envelope.consent.marketing,
    productId: entities?.productId ?? null,
    variantId: entities?.variantId ?? null,
    collectionId: entities?.collectionId ?? null,
    query: entities?.query ?? null,
    recommendationId: emptyToNull(attribution?.recommendationId ?? undefined),
    campaignId: emptyToNull(attribution?.campaignId ?? undefined),
    experienceId: emptyToNull(attribution?.experienceId ?? undefined),
    entities: entities ?? undefined,
    context: envelope.context ?? undefined,
    attribution: attribution ?? undefined,
    occurredAt: envelope.occurredAt,
  };
}
