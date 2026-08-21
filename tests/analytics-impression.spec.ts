/* eslint-disable */
import { describe, it, expect, beforeEach } from "vitest";
import { OfferPlacement, OfferType, PrismaClient } from "@prisma/client";
import { createOffer } from "../app/models/offer.server";
import {
  getOfferViewMetrics,
  trackOfferImpression,
} from "../app/models/offerAnalytics.server";

const db = new PrismaClient();
const SHOP = "analytics-tracking-test.myshopify.com";

describe("upsell viewed tracking", () => {
  beforeEach(async () => {
    await db.offerEvent.deleteMany({ where: { shop: SHOP } });
    await db.offer.deleteMany({ where: { shop: SHOP } });
  });

  it("deduplicates repeated logged-in impressions for the same offer within the same tracking period", async () => {
    const offer = await createOffer(SHOP, {
      name: "Logged-in View Test",
      type: OfferType.cross_sell,
      placement: OfferPlacement.checkout,
      targetProductIds: ["gid://shopify/Product/1001"],
      isActive: true,
    });

    const first = await trackOfferImpression({
      shop: SHOP,
      offerId: offer.id,
      offerName: offer.name,
      productId: "gid://shopify/Product/1001",
      variantId: "gid://shopify/ProductVariant/2001",
      placement: OfferPlacement.checkout,
      customerId: "customer-123",
      guestKey: null,
      isGuest: false,
    });

    const second = await trackOfferImpression({
      shop: SHOP,
      offerId: offer.id,
      offerName: offer.name,
      productId: "gid://shopify/Product/1001",
      variantId: "gid://shopify/ProductVariant/2001",
      placement: OfferPlacement.checkout,
      customerId: "customer-123",
      guestKey: null,
      isGuest: false,
    });

    expect(first.counted).toBe(true);
    expect(second.counted).toBe(false);

    const metrics = await getOfferViewMetrics(SHOP);
    expect(metrics.totalViews).toBe(1);
    expect(metrics.uniqueLoggedInUsers).toBe(1);
    expect(metrics.uniqueGuestUsers).toBe(0);
    expect(metrics.offerBreakdown[0]?.views).toBe(1);
  });

  it("deduplicates guest impressions using the same stable session key", async () => {
    const offer = await createOffer(SHOP, {
      name: "Guest View Test",
      type: OfferType.cross_sell,
      placement: OfferPlacement.checkout,
      targetProductIds: ["gid://shopify/Product/2002"],
      isActive: true,
    });

    const first = await trackOfferImpression({
      shop: SHOP,
      offerId: offer.id,
      offerName: offer.name,
      productId: "gid://shopify/Product/2002",
      variantId: "gid://shopify/ProductVariant/3002",
      placement: OfferPlacement.checkout,
      customerId: null,
      guestKey: "guest-session-abc",
      isGuest: true,
    });

    const second = await trackOfferImpression({
      shop: SHOP,
      offerId: offer.id,
      offerName: offer.name,
      productId: "gid://shopify/Product/2002",
      variantId: "gid://shopify/ProductVariant/3002",
      placement: OfferPlacement.checkout,
      customerId: null,
      guestKey: "guest-session-abc",
      isGuest: true,
    });

    expect(first.counted).toBe(true);
    expect(second.counted).toBe(false);

    const metrics = await getOfferViewMetrics(SHOP);
    expect(metrics.totalViews).toBe(1);
    expect(metrics.uniqueLoggedInUsers).toBe(0);
    expect(metrics.uniqueGuestUsers).toBe(1);
    expect(metrics.productBreakdown[0]?.views).toBe(1);
  });
});
