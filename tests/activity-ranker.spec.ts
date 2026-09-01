import { describe, it, expect, beforeEach } from "vitest";
import { BrowseActivityType, OfferPlacement, OfferType, PrismaClient } from "@prisma/client";
import { createOffer } from "../app/models/offer.server";
import { recordBrowseActivity, loadRecentActivity } from "../app/models/browseActivity.server";
import { rankEligibleOffers } from "../app/models/offerRanker.server";
import type { EligibleOfferPayload } from "../app/models/eligibleOffer";

const db = new PrismaClient();
const SHOP = "activity-ranker-test.myshopify.com";

function offerPayload(id: string, productId: string): EligibleOfferPayload {
  return {
    offerId: id,
    offerName: id,
    productId,
    variantId: `${productId}-variant`,
    productHandle: null,
    productTitle: productId,
    variantTitle: null,
    imageUrl: null,
    price: "10.00",
    promotionalTitle: null,
    offerType: OfferType.cross_sell,
    discountValue: null,
  };
}

describe("browse activity and ranker", () => {
  beforeEach(async () => {
    await db.browseActivity.deleteMany({ where: { shop: SHOP } });
    await db.offerEvent.deleteMany({ where: { shop: SHOP } });
    await db.offer.deleteMany({ where: { shop: SHOP } });
  });

  it("skips activity when consent is false", async () => {
    const result = await recordBrowseActivity({
      shop: SHOP,
      eventType: BrowseActivityType.product_viewed,
      clientId: "client-1",
      productId: "gid://shopify/Product/1",
      consented: false,
    });
    expect(result.recorded).toBe(false);
    expect(result.skipped).toBe("consent");
  });

  it("stores shop-scoped activity for clientId without email", async () => {
    const result = await recordBrowseActivity({
      shop: SHOP,
      eventType: BrowseActivityType.product_viewed,
      clientId: "client-1",
      productId: "gid://shopify/Product/99",
      consented: true,
    });
    expect(result.recorded).toBe(true);
    const rows = await loadRecentActivity(SHOP, { clientId: "client-1" });
    expect(rows).toHaveLength(1);
    expect(rows[0].productId).toBe("gid://shopify/Product/99");
  });

  it("ranks the recently viewed upsell first and falls back without activity", async () => {
    const offerA = await createOffer(SHOP, {
      name: "A",
      type: OfferType.cross_sell,
      placement: OfferPlacement.checkout,
      targetProductIds: ["trigger"],
      isActive: true,
    });
    const offerB = await createOffer(SHOP, {
      name: "B",
      type: OfferType.cross_sell,
      placement: OfferPlacement.checkout,
      targetProductIds: ["trigger"],
      isActive: true,
    });

    const eligible = [offerPayload(offerA.id, "gid://shopify/Product/1"), offerPayload(offerB.id, "gid://shopify/Product/2")];

    const withoutActivity = await rankEligibleOffers({
      shop: SHOP,
      offers: eligible,
      identity: { guestKey: "guest-1" },
    });
    expect(withoutActivity.map((o) => o.offerId)).toEqual([offerA.id, offerB.id]);

    await recordBrowseActivity({
      shop: SHOP,
      eventType: BrowseActivityType.product_viewed,
      guestKey: "guest-1",
      productId: "gid://shopify/Product/2",
      consented: true,
    });

    const ranked = await rankEligibleOffers({
      shop: SHOP,
      offers: eligible,
      identity: { guestKey: "guest-1" },
    });
    expect(ranked[0].offerId).toBe(offerB.id);
  });

  it("skips near-duplicate activity from dual ingest", async () => {
    const first = await recordBrowseActivity({
      shop: SHOP,
      eventType: BrowseActivityType.product_viewed,
      clientId: "client-dup",
      productId: "gid://shopify/Product/7",
      variantId: "gid://shopify/ProductVariant/7",
      consented: true,
    });
    const second = await recordBrowseActivity({
      shop: SHOP,
      eventType: BrowseActivityType.product_viewed,
      clientId: "client-dup",
      productId: "gid://shopify/Product/7",
      variantId: "gid://shopify/ProductVariant/7",
      consented: true,
    });
    expect(first.recorded).toBe(true);
    expect(second.recorded).toBe(false);
    expect(second.skipped).toBe("duplicate");
  });

  it("stores optional variant_changed and time_on_page events", async () => {
    const variant = await recordBrowseActivity({
      shop: SHOP,
      eventType: BrowseActivityType.variant_changed,
      guestKey: "guest-extra",
      productId: "gid://shopify/Product/8",
      variantId: "gid://shopify/ProductVariant/81",
      consented: true,
    });
    const dwell = await recordBrowseActivity({
      shop: SHOP,
      eventType: BrowseActivityType.time_on_page,
      guestKey: "guest-extra",
      productId: "gid://shopify/Product/8",
      query: "45",
      consented: true,
    });
    expect(variant.recorded).toBe(true);
    expect(dwell.recorded).toBe(true);
  });

  it("ranks an AI Recommend pool by activity and keeps pool order without activity", async () => {
    const { rankAiRecommendPool } = await import("../app/models/offerRanker.server");
    const { applyLlmPoolOrder, parseLlmPoolIds } = await import("../app/models/offerLlmPicker.server");

    const pool = [
      offerPayload("offer-ai", "gid://shopify/Product/1"),
      offerPayload("offer-ai", "gid://shopify/Product/2"),
    ];
    pool[0].variantId = "gid://shopify/ProductVariant/1";
    pool[1].variantId = "gid://shopify/ProductVariant/2";
    pool[1].productId = "gid://shopify/Product/2";

    const fallback = await rankAiRecommendPool({
      shop: SHOP,
      offerId: "offer-ai",
      pool,
      identity: { guestKey: "guest-pool" },
    });
    expect(fallback.map((item) => item.productId)).toEqual([
      "gid://shopify/Product/1",
      "gid://shopify/Product/2",
    ]);

    await recordBrowseActivity({
      shop: SHOP,
      eventType: BrowseActivityType.product_viewed,
      guestKey: "guest-pool",
      productId: "gid://shopify/Product/2",
      consented: true,
    });

    const ranked = await rankAiRecommendPool({
      shop: SHOP,
      offerId: "offer-ai",
      pool,
      identity: { guestKey: "guest-pool" },
    });
    expect(ranked[0].productId).toBe("gid://shopify/Product/2");

    const parsed = parseLlmPoolIds('["gid://shopify/ProductVariant/2"]', new Set(["gid://shopify/ProductVariant/1", "gid://shopify/ProductVariant/2"]));
    expect(applyLlmPoolOrder(pool, parsed)[0].variantId).toBe("gid://shopify/ProductVariant/2");
    expect(parseLlmPoolIds("not json", new Set(["gid://shopify/ProductVariant/1"]))).toEqual([]);
  });
});
