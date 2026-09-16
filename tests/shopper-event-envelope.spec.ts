import { describe, expect, it } from "vitest";
import {
  SHOPPER_EVENT_NAMES,
  SHOPPER_EVENT_SCHEMA_VERSION,
  allowsAnalyticsPersistence,
  parseShopperEventEnvelope,
  toShopperEventCreateData,
} from "../app/ai/events";

const valid = {
  schemaVersion: SHOPPER_EVENT_SCHEMA_VERSION,
  shop: "example.myshopify.com",
  eventId: "evt-1",
  occurredAt: "2026-09-16T10:00:00.000Z",
  sessionId: "sess-1",
  customerId: null,
  anonId: "anon-1",
  consent: { analytics: true, marketing: false },
  name: "product_view" as const,
  source: "product_page",
  surface: "pixel" as const,
  entities: { productId: "gid://shopify/Product/1" },
  context: { cartValue: 0, currency: "USD", path: "/products/shoes" },
  attribution: { campaignId: null, experienceId: null, recommendationId: null },
};

describe("shopper event envelope v1", () => {
  it("lists every Phase 1 event name", () => {
    expect(SHOPPER_EVENT_NAMES).toContain("product_view");
    expect(SHOPPER_EVENT_NAMES).toContain("recommendation_purchase");
    expect(SHOPPER_EVENT_NAMES).toHaveLength(25);
  });

  it("parses a valid v1 envelope and maps Prisma columns", () => {
    const result = parseShopperEventEnvelope(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.occurredAt.toISOString()).toBe("2026-09-16T10:00:00.000Z");
    expect(allowsAnalyticsPersistence(result.data)).toBe(true);
    const row = toShopperEventCreateData(result.data);
    expect(row.shop).toBe(valid.shop);
    expect(row.name).toBe("product_view");
    expect(row.productId).toBe("gid://shopify/Product/1");
    expect(row.consentAnalytics).toBe(true);
    expect(row.consentMarketing).toBe(false);
    expect(row.recommendationId).toBeNull();
  });

  it("rejects unknown schema versions and extra PII keys", () => {
    expect(parseShopperEventEnvelope({ ...valid, schemaVersion: 2 }).ok).toBe(false);
    expect(parseShopperEventEnvelope({ ...valid, email: "a@b.com" }).ok).toBe(false);
    expect(parseShopperEventEnvelope({ ...valid, name: "not_an_event" }).ok).toBe(false);
  });

  it("requires an opaque identity", () => {
    const result = parseShopperEventEnvelope({
      ...valid,
      sessionId: null,
      customerId: null,
      anonId: null,
    });
    expect(result.ok).toBe(false);
  });

  it("does not treat analytics=false as persistable", () => {
    const result = parseShopperEventEnvelope({
      ...valid,
      consent: { analytics: false, marketing: false },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(allowsAnalyticsPersistence(result.data)).toBe(false);
  });
});
