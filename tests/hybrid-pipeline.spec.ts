import { describe, expect, it } from "vitest";
import { MAX_UPSELL_PRODUCTS } from "../app/models/eligibleOffer";
import {
  applyBusinessRules,
  applyMerchantRules,
  mergeCandidatesByProduct,
  runHybridPipeline,
  type HybridCandidate,
  type ScoredHybridCandidate,
} from "../app/ai/recommend/pipeline";
import { scoreCandidate } from "../app/ai/scoring/scoreCandidate";

function cand(partial: Partial<HybridCandidate> & Pick<HybridCandidate, "productId" | "strategy">): HybridCandidate {
  return {
    relationScore: 1,
    availableForSale: true,
    inventoryQuantity: 10,
    affinity: 4,
    ...partial,
  };
}

describe("hybrid recommend pipeline", () => {
  it("applies business rules before scoring (anchor, in-cart, OOS)", () => {
    const { kept, dropped } = applyBusinessRules(
      [
        cand({ productId: "anchor", strategy: "fbt" }),
        cand({ productId: "cart-item", strategy: "similar" }),
        cand({ productId: "oos", strategy: "fbt", inventoryQuantity: 0 }),
        cand({ productId: "unavailable", strategy: "fbt", availableForSale: false }),
        cand({ productId: "ok", strategy: "complementary" }),
      ],
      { anchorProductIds: ["anchor"], cartProductIds: ["cart-item"] },
    );
    expect(kept.map((row) => row.productId)).toEqual(["ok"]);
    expect(dropped.map((row) => row.reason).sort()).toEqual([
      "anchor",
      "in_cart",
      "out_of_stock",
      "out_of_stock",
    ]);
  });

  it("merges strategies then merchant include/exclude/max N", () => {
    const merged = mergeCandidatesByProduct([
      cand({ productId: "a", strategy: "fbt", relationScore: 2, affinity: 2 }),
      cand({ productId: "a", strategy: "complementary", relationScore: 9, affinity: 0, complementarity: 9 }),
      cand({ productId: "b", strategy: "similar", relationScore: 3, affinity: 3 }),
    ]);
    const a = merged.find((row) => row.productId === "a");
    expect(a?.strategy).toBe("complementary");
    expect(a?.affinity).toBe(2);
    expect(a?.complementarity).toBe(9);

    const scored: ScoredHybridCandidate[] = [
      { ...cand({ productId: "keep", strategy: "fbt" }), score: scoreCandidate({ affinity: 8, availableForSale: true, inventoryQuantity: 10 }) },
      { ...cand({ productId: "blocked", strategy: "fbt" }), score: scoreCandidate({ affinity: 9, availableForSale: true, inventoryQuantity: 10 }) },
      { ...cand({ productId: "extra", strategy: "fbt" }), score: scoreCandidate({ affinity: 7, availableForSale: true, inventoryQuantity: 10 }) },
    ];
    scored.sort((left, right) => right.score.total - left.score.total);
    const merchant = applyMerchantRules(scored, {
      excludeProductIds: ["blocked"],
      includeProductIds: ["keep", "extra", "blocked"],
      maxN: 1,
    });
    expect(merchant.kept.map((row) => row.productId)).toEqual(["keep"]);
    expect(merchant.dropped.map((row) => row.reason).sort()).toEqual(["excluded", "max_n"]);
  });

  it("runs rules → candidates → score → max N in order", () => {
    const result = runHybridPipeline({
      anchorProductIds: ["p0"],
      cartProductIds: ["in-cart"],
      merchant: { excludeProductIds: ["excluded"], maxN: 1 },
      candidates: [
        cand({ productId: "p0", strategy: "fbt", affinity: 99 }),
        cand({ productId: "in-cart", strategy: "fbt", affinity: 99 }),
        cand({ productId: "excluded", strategy: "fbt", affinity: 50 }),
        cand({ productId: "low", strategy: "similar", affinity: 1, inventoryQuantity: 8 }),
        cand({ productId: "high", strategy: "fbt", affinity: 20, inventoryQuantity: 8 }),
      ],
    });
    expect(result.ranked).toHaveLength(1);
    expect(result.ranked[0].productId).toBe("high");
    expect(result.ranked[0].score.total).toBeGreaterThan(0);
    expect(result.dropped.some((row) => row.reason === "anchor")).toBe(true);
    expect(result.dropped.some((row) => row.reason === "in_cart")).toBe(true);
    expect(result.dropped.some((row) => row.reason === "excluded")).toBe(true);
    expect(result.dropped.some((row) => row.reason === "max_n")).toBe(true);
    expect(MAX_UPSELL_PRODUCTS).toBe(5);
  });
});
