/* eslint-disable */
import { describe, it, expect, beforeEach } from "vitest";
import { OfferPlacement, OfferType, PrismaClient } from "@prisma/client";
import { createOffer } from "../app/models/offer.server";
import {
  getOfferAnalyticsForOffer,
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

  it("calculates analytics for a single offer without mixing in other offers", async () => {
    const offerA = await createOffer(SHOP, {
      name: "Offer A",
      type: OfferType.cross_sell,
      placement: OfferPlacement.checkout,
      targetProductIds: ["pid-a"],
      isActive: true,
    });

    const offerB = await createOffer(SHOP, {
      name: "Offer B",
      type: OfferType.cross_sell,
      placement: OfferPlacement.checkout,
      targetProductIds: ["pid-b"],
      isActive: true,
    });

    await trackOfferImpression({
      shop: SHOP,
      offerId: offerA.id,
      offerName: offerA.name,
      productId: "pid-a",
      variantId: "variant-a",
      placement: OfferPlacement.checkout,
      customerId: "customer-a",
      guestKey: null,
      isGuest: false,
    });

    await trackOfferImpression({
      shop: SHOP,
      offerId: offerA.id,
      offerName: offerA.name,
      productId: "pid-a",
      variantId: "variant-a",
      placement: OfferPlacement.checkout,
      customerId: "customer-b",
      guestKey: null,
      isGuest: false,
    });

    await trackOfferImpression({
      shop: SHOP,
      offerId: offerB.id,
      offerName: offerB.name,
      productId: "pid-b",
      variantId: "variant-b",
      placement: OfferPlacement.checkout,
      customerId: "customer-c",
      guestKey: null,
      isGuest: false,
    });

    const metrics = await getOfferAnalyticsForOffer(SHOP, offerA.id);

    expect(metrics.offer.name).toBe("Offer A");
    expect(metrics.summary.totalViews).toBe(2);
    expect(metrics.summary.uniqueLoggedInUsers).toBe(2);
    expect(metrics.summary.uniqueGuestUsers).toBe(0);
    expect(metrics.products.every((product) => product.offerId === offerA.id)).toBe(true);
    expect(metrics.products[0]?.views).toBeGreaterThanOrEqual(2);
    expect(metrics.products[0]?.productId).toBe("pid-a");
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
