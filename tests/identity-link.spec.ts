import { ConsentSubjectType, PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { ingestShopperEventBatch } from "../app/ai/events/ingest.server";
import { recordIdentitySighting, resolveCustomerId } from "../app/ai/events/identity.server";

const db = new PrismaClient();
const SHOP = "identity-link-test.myshopify.com";
const OTHER = "identity-link-other.myshopify.com";

describe("shop-scoped identity merge", () => {
  it("links session and anon to customer on login and backfills ShopperEvent", async () => {
    await db.identityLink.deleteMany({ where: { shop: SHOP } });
    await db.shopperEvent.deleteMany({ where: { shop: SHOP } });

    await ingestShopperEventBatch({
      shop: SHOP,
      consented: true,
      events: [
        {
          name: "cart_view",
          sessionId: "sess-1",
          anonId: "anon-1",
        },
      ],
    });

    const before = await db.shopperEvent.findFirst({ where: { shop: SHOP, sessionId: "sess-1" } });
    expect(before?.customerId).toBeNull();

    await ingestShopperEventBatch({
      shop: SHOP,
      consented: true,
      events: [
        {
          name: "add_to_cart",
          sessionId: "sess-1",
          anonId: "anon-1",
          customerId: "gid://shopify/Customer/99",
          entities: { productId: "gid://shopify/Product/1" },
        },
      ],
    });

    const links = await db.identityLink.findMany({ where: { shop: SHOP } });
    expect(links.some((row) => row.fromType === ConsentSubjectType.session && row.toType === ConsentSubjectType.customer)).toBe(true);
    expect(links.some((row) => row.fromType === ConsentSubjectType.anon && row.toType === ConsentSubjectType.customer)).toBe(true);

    const after = await db.shopperEvent.findFirst({ where: { shop: SHOP, sessionId: "sess-1", name: "cart_view" } });
    expect(after?.customerId).toBe("gid://shopify/Customer/99");
    expect(await resolveCustomerId(SHOP, { sessionId: "sess-1" })).toBe("gid://shopify/Customer/99");
  }, 20_000);

  it("does not join shops or replace an existing customer link", async () => {
    await db.identityLink.deleteMany({ where: { shop: { in: [SHOP, OTHER] } } });
    await recordIdentitySighting({
      shop: SHOP,
      sessionId: "sess-keep",
      customerId: "gid://shopify/Customer/1",
    });
    await recordIdentitySighting({
      shop: SHOP,
      sessionId: "sess-keep",
      customerId: "gid://shopify/Customer/2",
    });
    await recordIdentitySighting({
      shop: OTHER,
      sessionId: "sess-keep",
      customerId: "gid://shopify/Customer/9",
    });

    expect(await resolveCustomerId(SHOP, { sessionId: "sess-keep" })).toBe("gid://shopify/Customer/1");
    expect(await resolveCustomerId(OTHER, { sessionId: "sess-keep" })).toBe("gid://shopify/Customer/9");
  }, 20_000);
});
