import { ConsentSubjectType, PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { refreshShopperProfile } from "../app/ai/intent/profile.server";

const db = new PrismaClient();
const SHOP = "intent-profile-test.myshopify.com";

describe("shopper profile snapshot", () => {
  it("upserts a shop-scoped profile and intent snapshot from events", async () => {
    await db.shopperIntentSnapshot.deleteMany({ where: { shop: SHOP } });
    await db.shopperProfile.deleteMany({ where: { shop: SHOP } });
    await db.shopperEvent.deleteMany({ where: { shop: SHOP } });

    await db.shopperEvent.createMany({
      data: [
        {
          shop: SHOP,
          eventId: "intent-v1",
          name: "product_view",
          anonId: "anon-intent",
          productId: "gid://shopify/Product/1",
          consentAnalytics: true,
          occurredAt: new Date(),
        },
        {
          shop: SHOP,
          eventId: "intent-v2",
          name: "product_view",
          anonId: "anon-intent",
          productId: "gid://shopify/Product/2",
          consentAnalytics: true,
          occurredAt: new Date(),
        },
        {
          shop: SHOP,
          eventId: "intent-v3",
          name: "product_view",
          anonId: "anon-intent",
          productId: "gid://shopify/Product/3",
          consentAnalytics: true,
          occurredAt: new Date(),
        },
      ],
    });

    const inferred = await refreshShopperProfile({ shop: SHOP, anonId: "anon-intent" });
    expect(inferred.state).toBe("COMPARING");

    const profile = await db.shopperProfile.findFirst({
      where: { shop: SHOP, subjectId: "anon-intent" },
    });
    expect(profile?.subjectType).toBe(ConsentSubjectType.anon);
    expect(profile?.intentState).toBe("COMPARING");
    expect(profile?.recentProductIds).toHaveLength(3);

    expect(await db.shopperIntentSnapshot.count({ where: { shop: SHOP } })).toBe(1);
  }, 20_000);
});
