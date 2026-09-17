import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { applyMerchantRules, type ScoredHybridCandidate } from "../app/ai/recommend/pipeline";
import { parseProductIdList } from "../app/config/merchantRules";
import { upsertMerchantRuleSet } from "../app/models/merchantRuleSet.server";
import { scoreCandidate } from "../app/ai/scoring/scoreCandidate";

const db = new PrismaClient();
const SHOP = "merchant-rules-test.myshopify.com";

function scored(
  productId: string,
  extras: Partial<ScoredHybridCandidate> = {},
): ScoredHybridCandidate {
  return {
    productId,
    strategy: "fbt",
    relationScore: 1,
    availableForSale: true,
    inventoryQuantity: 10,
    score: scoreCandidate({ affinity: extras.affinity ?? 1, availableForSale: true, inventoryQuantity: 10 }),
    ...extras,
  };
}

describe("merchant rule set", () => {
  it("parses product GIDs and numeric ids", () => {
    expect(
      parseProductIdList("gid://shopify/Product/1\n2, 3"),
    ).toEqual([
      "gid://shopify/Product/1",
      "gid://shopify/Product/2",
      "gid://shopify/Product/3",
    ]);
  });

  it("pins always products, drops never/price/margin when cost exists", () => {
    const ranked = [
      scored("cheap", { price: 5, affinity: 9 }),
      scored("low-margin", { price: 20, marginPercent: 5, affinity: 8 }),
      scored("always", { price: 15, affinity: 1 }),
      scored("ok", { price: 18, affinity: 7 }),
    ];
    const { kept, dropped } = applyMerchantRules(ranked, {
      excludeProductIds: [],
      alwaysProductIds: ["always"],
      maxN: 2,
      priceMin: 10,
      priceMax: 50,
      minMarginPercent: 10,
    });
    expect(kept.map((row) => row.productId)).toEqual(["always", "ok"]);
    expect(dropped.map((row) => row.reason).sort()).toEqual(["min_margin", "price_band"]);
  });

  it("skips min margin when cost is unknown", () => {
    const { kept } = applyMerchantRules([scored("unknown", { price: 12, marginPercent: null })], {
      minMarginPercent: 40,
      maxN: 5,
    });
    expect(kept.map((row) => row.productId)).toEqual(["unknown"]);
  });

  it("upserts a shop-scoped rule set", async () => {
    await db.merchantRuleSet.deleteMany({ where: { shop: SHOP } });
    const saved = await upsertMerchantRuleSet(SHOP, {
      neverProductIds: ["gid://shopify/Product/9"],
      alwaysProductIds: ["gid://shopify/Product/8"],
      maxN: 3,
      minMarginPercent: 12.5,
      priceMin: 10,
      priceMax: 80,
    });
    expect(saved.maxN).toBe(3);
    expect(saved.neverProductIds).toEqual(["gid://shopify/Product/9"]);
    expect(saved.minMarginPercent).toBe(12.5);
    expect(saved.holdoutPercent).toBe(10);
    expect(saved.optimizationGoal).toBe("revenue");

    const withGoal = await upsertMerchantRuleSet(SHOP, {
      neverProductIds: ["gid://shopify/Product/9"],
      alwaysProductIds: ["gid://shopify/Product/8"],
      maxN: 3,
      minMarginPercent: 12.5,
      optimizationGoal: "aov",
      priceMin: 10,
      priceMax: 80,
    });
    expect(withGoal.optimizationGoal).toBe("aov");

    const profitWithoutMargin = await upsertMerchantRuleSet(SHOP, {
      neverProductIds: ["gid://shopify/Product/9"],
      alwaysProductIds: ["gid://shopify/Product/8"],
      maxN: 3,
      minMarginPercent: null,
      optimizationGoal: "profit",
      priceMin: 10,
      priceMax: 80,
    });
    expect(profitWithoutMargin.optimizationGoal).toBe("revenue");

    const tighter = await upsertMerchantRuleSet(SHOP, {
      neverProductIds: ["gid://shopify/Product/9"],
      alwaysProductIds: ["gid://shopify/Product/8"],
      maxN: 3,
      minMarginPercent: 12.5,
      holdoutPercent: 0,
      priceMin: 10,
      priceMax: 80,
    });
    expect(tighter.holdoutPercent).toBe(5);
  }, 20_000);
});
