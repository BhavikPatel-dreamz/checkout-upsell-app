import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { ingestShopperEventBatch } from "../app/ai/events/ingest.server";
import { emitPurchaseShopperEvents } from "../app/models/orderPurchase.server";

const db = new PrismaClient();
const SHOP = "orders-purchase-webhook-test.myshopify.com";

const orderPayload = {
  id: 1001,
  admin_graphql_api_id: "gid://shopify/Order/1001",
  created_at: "2026-09-16T10:00:00.000Z",
  total_price: "42.00",
  currency: "USD",
  cart_token: "cart-token-1",
  customer: { id: 77 },
  line_items: [
    {
      id: 11,
      product_id: 1,
      variant_id: 2,
      quantity: 1,
      properties: [{ name: "_upsell_offer_id", value: "offer-abc" }],
    },
    {
      id: 12,
      product_id: 3,
      variant_id: 4,
      quantity: 2,
    },
  ],
};

describe("order purchase ShopperEvents", () => {
  it("emits checkout_completed plus one purchase per line and is idempotent", async () => {
    await db.offerEvent.deleteMany({ where: { shop: SHOP } });
    await db.shopperEvent.deleteMany({ where: { shop: SHOP } });
    const first = await emitPurchaseShopperEvents({ shop: SHOP, payload: orderPayload });
    const second = await emitPurchaseShopperEvents({ shop: SHOP, payload: orderPayload });
    expect(first.accepted).toBe(3);
    expect(second.accepted).toBe(0);
    const rows = await db.shopperEvent.findMany({ where: { shop: SHOP }, orderBy: { name: "asc" } });
    expect(rows.map((row) => row.name).sort()).toEqual([
      "checkout_completed",
      "purchase",
      "purchase",
    ]);
    expect(rows.some((row) => row.recommendationId === "offer-abc")).toBe(true);
    expect(rows[0].customerId).toBe("gid://shopify/Customer/77");
  }, 20_000);

  it("attributes a line to the last in-window recommendation and dual-writes OfferEvent.purchased", async () => {
    const { createOffer } = await import("../app/models/offer.server");
    const { OfferPlacement, OfferType } = await import("@prisma/client");
    await db.offerEvent.deleteMany({ where: { shop: SHOP } });
    await db.shopperEvent.deleteMany({ where: { shop: SHOP } });
    await db.offer.deleteMany({ where: { shop: SHOP } });

    const offer = await createOffer(SHOP, {
      name: "Attr",
      type: OfferType.cross_sell,
      placement: OfferPlacement.checkout,
      targetProductIds: ["trigger"],
      isActive: true,
    });

    await ingestShopperEventBatch({
      shop: SHOP,
      consented: true,
      events: [
        {
          name: "recommendation_click",
          customerId: "gid://shopify/Customer/77",
          anonId: "cart-token-1",
          occurredAt: "2026-09-16T09:00:00.000Z",
          entities: {
            productId: "gid://shopify/Product/3",
            variantId: "gid://shopify/ProductVariant/4",
          },
          attribution: { recommendationId: offer.id },
        },
      ],
    });

    await emitPurchaseShopperEvents({
      shop: SHOP,
      payload: {
        ...orderPayload,
        id: 1002,
        admin_graphql_api_id: "gid://shopify/Order/1002",
        line_items: [
          {
            id: 22,
            product_id: 3,
            variant_id: 4,
            quantity: 1,
            price: "10.00",
          },
        ],
      },
    });

    const purchase = await db.shopperEvent.findFirst({
      where: { shop: SHOP, name: "purchase", eventId: "purchase:gid://shopify/Order/1002:22" },
    });
    expect(purchase?.recommendationId).toBe(offer.id);
    const offerPurchase = await db.offerEvent.findFirst({
      where: { shop: SHOP, offerId: offer.id, eventType: "purchased" },
    });
    expect(offerPurchase?.productId).toBe("gid://shopify/Product/3");
    expect(offerPurchase?.orderId).toBe("gid://shopify/Order/1002");
  }, 20_000);
});
