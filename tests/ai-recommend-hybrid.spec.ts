import { OfferType, PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { orderPoolByRankedProducts, rankAiRecommendWithHybrid } from "../app/ai/recommend/rankAiRecommend.server";
import type { EligibleOfferPayload } from "../app/models/eligibleOffer";
import { upsertMerchantRuleSet } from "../app/models/merchantRuleSet.server";

const db = new PrismaClient();
const SHOP = "ai-recommend-hybrid-test.myshopify.com";

function payload(productId: string, variantId: string): EligibleOfferPayload {
  return {
    offerId: "offer-1",
    offerName: "AI",
    productId,
    variantId,
    productHandle: null,
    productTitle: productId,
    variantTitle: null,
    imageUrl: null,
    price: "10.00",
    promotionalTitle: null,
    offerType: OfferType.ai_recommend,
    discountValue: null,
  };
}

describe("ai_recommend hybrid ranking", () => {
  it("orders the merchant pool by ranked product ids and drops the rest", () => {
    const pool = [
      payload("gid://shopify/Product/1", "v1"),
      payload("gid://shopify/Product/2", "v2"),
      payload("gid://shopify/Product/3", "v3"),
    ];
    expect(orderPoolByRankedProducts(pool, ["gid://shopify/Product/3", "gid://shopify/Product/1"]).map((row) => row.variantId)).toEqual([
      "v3",
      "v1",
    ]);
  });

  it("keeps merchant pool first and honors never-recommend", async () => {
    await db.merchantRuleSet.deleteMany({ where: { shop: SHOP } });
    await upsertMerchantRuleSet(SHOP, {
      neverProductIds: ["gid://shopify/Product/blocked"],
      alwaysProductIds: [],
      maxN: 5,
      minMarginPercent: null,
      priceMin: null,
      priceMax: null,
    });

    const ranked = await rankAiRecommendWithHybrid({
      shop: SHOP,
      offerId: "offer-1",
      identity: {},
      catalogExpand: false,
      cartProductIds: ["gid://shopify/Product/trigger"],
      anchorProductIds: ["gid://shopify/Product/trigger"],
      pool: [
        payload("gid://shopify/Product/ok", "v-ok"),
        payload("gid://shopify/Product/blocked", "v-blocked"),
      ],
    });

    expect(ranked.map((row) => row.variantId)).toEqual(["v-ok"]);
  }, 20_000);
});
