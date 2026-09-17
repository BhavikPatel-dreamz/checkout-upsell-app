import { describe, expect, it } from "vitest";
import {
  associationLift,
  detectSmartMomentCandidates,
  expectedImpactFromLift,
} from "../app/ai/moments/detect";
import {
  momentOfferFormPath,
  offerDraftFromSmartMoment,
} from "../app/ai/moments/fromMoment";
import { buildOfferPayload } from "../app/models/offer.server";

describe("Smart Moments detectors (AI-6.1)", () => {
  it("computes association lift from pair support", () => {
    expect(associationLift(10, 20, 25, 100)).toBe(2);
    expect(associationLift(0, 20, 25, 100)).toBe(0);
    expect(expectedImpactFromLift(2, 10)).toBe(10);
  });

  it("ranks buy-together pairs above the lift floor and labels complementary relations", () => {
    const moments = detectSmartMomentCandidates([
      {
        productId: "A",
        relatedProductId: "B",
        buyBuyCount: 10,
        viewViewCount: 12,
        atcAtcCount: 8,
        score: 40,
        relationKind: "complementary",
      },
      {
        productId: "A",
        relatedProductId: "C",
        buyBuyCount: 1,
        viewViewCount: 50,
        atcAtcCount: 1,
        score: 5,
        relationKind: "similar",
      },
      {
        productId: "D",
        relatedProductId: "E",
        buyBuyCount: 10,
        viewViewCount: 10,
        atcAtcCount: 10,
        score: 20,
        relationKind: "fbt",
      },
    ]);
    const complementary = moments.find((row) => row.relatedProductId === "B");
    expect(complementary?.kind).toBe("complementary_lift");
    expect(complementary?.lift).toBeGreaterThanOrEqual(1.25);
    expect(moments.every((row) => row.productId !== row.relatedProductId)).toBe(true);
  });

  it("drops self-pairs and weak support", () => {
    const moments = detectSmartMomentCandidates([
      {
        productId: "A",
        relatedProductId: "A",
        buyBuyCount: 99,
        viewViewCount: 99,
        atcAtcCount: 99,
        score: 99,
      },
      {
        productId: "A",
        relatedProductId: "Z",
        buyBuyCount: 1,
        viewViewCount: 1,
        atcAtcCount: 0,
        score: 1,
      },
    ]);
    expect(moments).toEqual([]);
  });
});

describe("Smart Moment → OfferForm (AI-6.3)", () => {
  it("prefills the unified form and forces a draft payload", () => {
    expect(momentOfferFormPath("mom_1")).toContain("momentId=mom_1");
    expect(momentOfferFormPath("mom_1")).toContain("offerType=cross_sell");

    const draft = offerDraftFromSmartMoment({
      id: "mom_1",
      kind: "fbt_lift",
      productId: "gid://shopify/Product/1",
      relatedProductId: "gid://shopify/Product/2",
      explanation: "Lift 2.0",
      relatedVariantId: "gid://shopify/ProductVariant/2",
    });
    expect(draft.isActive).toBe(false);
    expect(draft.triggerProductIds).toEqual(["gid://shopify/Product/1"]);
    expect(draft.manualSelections[0]?.productId).toBe("gid://shopify/Product/2");
    expect(draft.displayLocation).toBe("product_page");

    const built = buildOfferPayload({
      ...draft,
      status: "Draft",
      triggerRules: { smartMomentId: draft.smartMomentId },
    });
    expect(built.isActive).toBe(false);
    expect(built.targetProductIds).toEqual(["gid://shopify/Product/1"]);
  });
});
