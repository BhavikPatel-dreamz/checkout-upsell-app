import { describe, it, expect, beforeEach } from "vitest";
import { BrowseActivityType, OfferPlacement, OfferType, PrismaClient } from "@prisma/client";
import { createOffer } from "../app/models/offer.server";
import { recordBrowseActivity, loadRecentActivity } from "../app/models/browseActivity.server";
import { rankEligibleOffers } from "../app/models/offerRanker.server";
import type { EligibleOfferPayload } from "../app/models/offerEligibility.server";

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
});
