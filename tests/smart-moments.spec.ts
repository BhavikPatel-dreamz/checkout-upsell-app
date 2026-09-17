import { describe, expect, it } from "vitest";
import {
  associationLift,
  detectSmartMomentCandidates,
  expectedImpactFromLift,
} from "../app/ai/moments/detect";

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
