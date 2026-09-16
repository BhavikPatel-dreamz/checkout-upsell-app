import { BrowseActivityType, OfferPlacement, OfferType, PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { ingestShopperEventBatch } from "../app/ai/events/ingest.server";
import { resolveCustomerId } from "../app/ai/events/identity.server";
import { recordBrowseActivity } from "../app/models/browseActivity.server";
import { createOffer } from "../app/models/offer.server";
import { emitPurchaseShopperEvents } from "../app/models/orderPurchase.server";
import { upsertShopPrivacySettings } from "../app/models/shopPrivacy.server";

const db = new PrismaClient();
const SHOP = "phase1-foundation-test.myshopify.com";

describe("AI-1.11 Phase 1 foundation", () => {
  it("ingests a consented recommendation event", async () => {
    await db.shopperEvent.deleteMany({ where: { shop: SHOP } });
    await upsertShopPrivacySettings(SHOP, { trackingEnabled: true, privacyRetentionDays: 90 });
    const result = await ingestShopperEventBatch({
      shop: SHOP,
      consented: true,
      events: [
        {
          name: "recommendation_view",
          anonId: "phase1-anon",
          entities: { productId: "gid://shopify/Product/10" },
          attribution: { recommendationId: "offer-view" },
        },
      ],
    });
    expect(result.accepted).toBe(1);
    expect(result.skipped.consent).toBe(0);
    const row = await db.shopperEvent.findFirst({ where: { shop: SHOP, name: "recommendation_view" } });
    expect(row?.anonId).toBe("phase1-anon");
    expect(row?.recommendationId).toBe("offer-view");
  }, 20_000);

  it("drops ingest and browse activity when consent or shop tracking is off", async () => {
    await upsertShopPrivacySettings(SHOP, { trackingEnabled: true, privacyRetentionDays: 90 });
    const noConsent = await ingestShopperEventBatch({
      shop: SHOP,
      consented: false,
      events: [{ name: "add_to_cart", anonId: "phase1-anon" }],
    });
    expect(noConsent.accepted).toBe(0);
    expect(noConsent.skipped.consent).toBe(1);

    const browse = await recordBrowseActivity({
      shop: SHOP,
      eventType: BrowseActivityType.product_viewed,
      clientId: "phase1-client",
      productId: "gid://shopify/Product/10",
      consented: false,
    });
    expect(browse.recorded).toBe(false);
    expect(browse.skipped).toBe("consent");

    await upsertShopPrivacySettings(SHOP, { trackingEnabled: false, privacyRetentionDays: 90 });
    const disabled = await ingestShopperEventBatch({
      shop: SHOP,
      consented: true,
      events: [{ name: "add_to_cart", anonId: "phase1-anon", entities: { productId: "gid://shopify/Product/10" } }],
    });
    expect(disabled.accepted).toBe(0);
    expect(disabled.skipped.consent).toBe(1);
    await upsertShopPrivacySettings(SHOP, { trackingEnabled: true, privacyRetentionDays: 90 });
  }, 20_000);

  it("merges session to customer within the shop", async () => {
    await db.identityLink.deleteMany({ where: { shop: SHOP } });
    await db.shopperEvent.deleteMany({ where: { shop: SHOP } });
    await ingestShopperEventBatch({
      shop: SHOP,
      consented: true,
      events: [{ name: "cart_view", sessionId: "phase1-sess", anonId: "phase1-anon" }],
    });
    await ingestShopperEventBatch({
      shop: SHOP,
      consented: true,
      events: [
        {
          name: "add_to_cart",
          sessionId: "phase1-sess",
          anonId: "phase1-anon",
          customerId: "gid://shopify/Customer/501",
          entities: { productId: "gid://shopify/Product/10" },
        },
      ],
    });
    expect(await resolveCustomerId(SHOP, { sessionId: "phase1-sess" })).toBe(
      "gid://shopify/Customer/501",
    );
    const guest = await db.shopperEvent.findFirst({
      where: { shop: SHOP, name: "cart_view", sessionId: "phase1-sess" },
    });
    expect(guest?.customerId).toBe("gid://shopify/Customer/501");
  }, 20_000);

  it("attributes a purchase only when the recommendation is inside the 7-day window", async () => {
    await db.offerEvent.deleteMany({ where: { shop: SHOP } });
    await db.shopperEvent.deleteMany({ where: { shop: SHOP } });
    await db.offer.deleteMany({ where: { shop: SHOP } });

    const offer = await createOffer(SHOP, {
      name: "Window",
      type: OfferType.cross_sell,
      placement: OfferPlacement.checkout,
      targetProductIds: ["trigger"],
      isActive: true,
    });

    const purchaseAt = "2026-09-16T12:00:00.000Z";
    await ingestShopperEventBatch({
      shop: SHOP,
      consented: true,
      events: [
        {
          name: "recommendation_click",
          customerId: "gid://shopify/Customer/501",
          occurredAt: "2026-09-07T11:00:00.000Z",
          entities: {
            productId: "gid://shopify/Product/80",
            variantId: "gid://shopify/ProductVariant/81",
          },
          attribution: { recommendationId: offer.id },
        },
      ],
    });

    await emitPurchaseShopperEvents({
      shop: SHOP,
      payload: {
        id: 8801,
        admin_graphql_api_id: "gid://shopify/Order/8801",
        created_at: purchaseAt,
        customer: { id: 501 },
        line_items: [
          { id: 1, product_id: 80, variant_id: 81, quantity: 1, price: "5.00" },
        ],
      },
    });

    const stale = await db.shopperEvent.findFirst({
      where: { shop: SHOP, eventId: "purchase:gid://shopify/Order/8801:1" },
    });
    expect(stale?.recommendationId).toBeNull();

    await ingestShopperEventBatch({
      shop: SHOP,
      consented: true,
      events: [
        {
          name: "recommendation_click",
          customerId: "gid://shopify/Customer/501",
          occurredAt: "2026-09-15T12:00:00.000Z",
          entities: {
            productId: "gid://shopify/Product/80",
            variantId: "gid://shopify/ProductVariant/81",
          },
          attribution: { recommendationId: offer.id },
        },
      ],
    });

    await emitPurchaseShopperEvents({
      shop: SHOP,
      payload: {
        id: 8802,
        admin_graphql_api_id: "gid://shopify/Order/8802",
        created_at: purchaseAt,
        customer: { id: 501 },
        line_items: [
          { id: 2, product_id: 80, variant_id: 81, quantity: 1, price: "5.00" },
        ],
      },
    });

    const fresh = await db.shopperEvent.findFirst({
      where: { shop: SHOP, eventId: "purchase:gid://shopify/Order/8802:2" },
    });
    expect(fresh?.recommendationId).toBe(offer.id);
    const purchased = await db.offerEvent.findFirst({
      where: { shop: SHOP, offerId: offer.id, eventType: "purchased", orderId: "gid://shopify/Order/8802" },
    });
    expect(purchased).toBeTruthy();
  }, 20_000);
});
