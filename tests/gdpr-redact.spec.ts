import { ConsentSubjectType, PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { redactCustomerData, redactShopData } from "../app/privacy/gdpr.server";

const db = new PrismaClient();
const SHOP = "gdpr-redact-test.myshopify.com";
const OTHER = "gdpr-redact-other.myshopify.com";

describe("GDPR redact", () => {
  it("deletes the customer’s events, activity, and identity links in that shop only", async () => {
    await db.shopperEvent.deleteMany({ where: { shop: { in: [SHOP, OTHER] } } });
    await db.browseActivity.deleteMany({ where: { shop: { in: [SHOP, OTHER] } } });
    await db.identityLink.deleteMany({ where: { shop: { in: [SHOP, OTHER] } } });
    await db.consentState.deleteMany({ where: { shop: { in: [SHOP, OTHER] } } });
    await db.customerProductAffinity.deleteMany({ where: { shop: { in: [SHOP, OTHER] } } });

    await db.identityLink.create({
      data: {
        shop: SHOP,
        fromType: ConsentSubjectType.session,
        fromId: "sess-gdpr",
        toType: ConsentSubjectType.customer,
        toId: "gid://shopify/Customer/55",
      },
    });
    await db.shopperEvent.create({
      data: {
        shop: SHOP,
        eventId: "gdpr-sess",
        name: "page_view",
        sessionId: "sess-gdpr",
        occurredAt: new Date(),
      },
    });
    await db.shopperEvent.create({
      data: {
        shop: OTHER,
        eventId: "gdpr-other",
        name: "page_view",
        customerId: "gid://shopify/Customer/55",
        occurredAt: new Date(),
      },
    });
    await db.browseActivity.create({
      data: {
        shop: SHOP,
        eventType: "product_viewed",
        customerId: "gid://shopify/Customer/55",
        occurredAt: new Date(),
      },
    });
    await db.consentState.create({
      data: {
        shop: SHOP,
        subjectType: ConsentSubjectType.customer,
        subjectId: "gid://shopify/Customer/55",
        analytics: true,
      },
    });
    await db.customerProductAffinity.create({
      data: {
        shop: SHOP,
        subjectType: ConsentSubjectType.customer,
        subjectId: "gid://shopify/Customer/55",
        productId: "gid://shopify/Product/1",
        viewCount: 2,
        lastOccurredAt: new Date(),
        score: 2,
      },
    });

    const result = await redactCustomerData({ shop: SHOP, customerId: 55 });
    expect(result.deleted.shopperEvents).toBe(1);
    expect(result.deleted.browseActivities).toBe(1);
    expect(result.deleted.identityLinks).toBe(1);
    expect(result.deleted.consentStates).toBe(1);
    expect(result.deleted.customerProductAffinity).toBe(1);
    expect(await db.shopperEvent.count({ where: { shop: OTHER } })).toBe(1);
  }, 20_000);

  it("shop redact deletes all behavioral data for that shop", async () => {
    await db.shopperEvent.deleteMany({ where: { shop: SHOP } });
    await db.productProductAffinity.deleteMany({ where: { shop: SHOP } });
    await db.shopperEvent.create({
      data: {
        shop: SHOP,
        eventId: "shop-redact-1",
        name: "purchase",
        anonId: "anon-x",
        occurredAt: new Date(),
      },
    });
    await db.productProductAffinity.create({
      data: {
        shop: SHOP,
        productId: "gid://shopify/Product/1",
        relatedProductId: "gid://shopify/Product/2",
        viewViewCount: 1,
        lastOccurredAt: new Date(),
        score: 1,
      },
    });
    const result = await redactShopData(SHOP);
    expect(result.deleted.shopperEvents).toBe(1);
    expect(result.deleted.productProductAffinity).toBe(1);
    expect(await db.shopperEvent.count({ where: { shop: SHOP } })).toBe(0);
  }, 20_000);
});
