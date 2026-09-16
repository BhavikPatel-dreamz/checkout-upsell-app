import { ConsentSubjectType, PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { affinityScore, rebuildAffinityTables } from "../app/jobs/affinity.server";

const db = new PrismaClient();
const SHOP = "affinity-rollup-test.myshopify.com";
const OTHER = "affinity-rollup-other.myshopify.com";

describe("affinity rollup job", () => {
  it("scores views, ATC, and purchases with recency", () => {
    const now = new Date("2026-09-16T00:00:00.000Z");
    const fresh = affinityScore({
      viewCount: 1,
      atcCount: 1,
      purchaseCount: 1,
      lastOccurredAt: now,
      now,
    });
    expect(fresh).toBe(1 + 3 + 5);
    const older = affinityScore({
      viewCount: 1,
      atcCount: 0,
      purchaseCount: 0,
      lastOccurredAt: new Date("2026-08-17T00:00:00.000Z"),
      now,
    });
    expect(older).toBeLessThan(1);
    expect(older).toBeGreaterThan(0);
  });

  it("rebuilds customer–product and product–product counts from consented events", async () => {
    await db.shopperEvent.deleteMany({ where: { shop: { in: [SHOP, OTHER] } } });
    await db.customerProductAffinity.deleteMany({ where: { shop: { in: [SHOP, OTHER] } } });
    await db.productProductAffinity.deleteMany({ where: { shop: { in: [SHOP, OTHER] } } });

    const now = new Date();
    await db.shopperEvent.createMany({
      data: [
        {
          shop: SHOP,
          eventId: "aff-v1",
          name: "product_view",
          customerId: "gid://shopify/Customer/9",
          productId: "gid://shopify/Product/1",
          consentAnalytics: true,
          occurredAt: now,
        },
        {
          shop: SHOP,
          eventId: "aff-v2",
          name: "product_view",
          customerId: "gid://shopify/Customer/9",
          productId: "gid://shopify/Product/2",
          consentAnalytics: true,
          occurredAt: now,
        },
        {
          shop: SHOP,
          eventId: "aff-atc",
          name: "add_to_cart",
          customerId: "gid://shopify/Customer/9",
          productId: "gid://shopify/Product/1",
          consentAnalytics: true,
          occurredAt: now,
        },
        {
          shop: SHOP,
          eventId: "aff-buy",
          name: "purchase",
          customerId: "gid://shopify/Customer/9",
          productId: "gid://shopify/Product/2",
          consentAnalytics: true,
          occurredAt: now,
        },
        {
          shop: SHOP,
          eventId: "aff-drop",
          name: "product_view",
          customerId: "gid://shopify/Customer/9",
          productId: "gid://shopify/Product/3",
          consentAnalytics: false,
          occurredAt: now,
        },
        {
          shop: OTHER,
          eventId: "aff-other",
          name: "product_view",
          customerId: "gid://shopify/Customer/9",
          productId: "gid://shopify/Product/1",
          consentAnalytics: true,
          occurredAt: now,
        },
      ],
    });

    const result = await rebuildAffinityTables(SHOP);
    expect(result.shops).toBe(1);
    expect(result.customerProductRows).toBe(2);
    expect(result.productProductRows).toBe(2);

    const interests = await db.customerProductAffinity.findMany({
      where: { shop: SHOP },
      orderBy: { productId: "asc" },
    });
    expect(interests).toHaveLength(2);
    expect(interests[0]).toMatchObject({
      subjectType: ConsentSubjectType.customer,
      subjectId: "gid://shopify/Customer/9",
      productId: "gid://shopify/Product/1",
      viewCount: 1,
      atcCount: 1,
      purchaseCount: 0,
    });
    expect(interests[1]).toMatchObject({
      productId: "gid://shopify/Product/2",
      viewCount: 1,
      purchaseCount: 1,
    });

    const pairs = await db.productProductAffinity.findMany({
      where: { shop: SHOP },
      orderBy: { productId: "asc" },
    });
    expect(pairs.map((row) => `${row.productId}->${row.relatedProductId}`).sort()).toEqual([
      "gid://shopify/Product/1->gid://shopify/Product/2",
      "gid://shopify/Product/2->gid://shopify/Product/1",
    ]);
    expect(pairs.every((row) => row.viewViewCount === 1)).toBe(true);
    expect(await db.customerProductAffinity.count({ where: { shop: OTHER } })).toBe(0);
  }, 20_000);
});
