import { describe, expect, it } from "vitest";
import {
  SCORE_WEIGHTS,
  compareCandidateScores,
  inventoryFactor,
  scoreCandidate,
  squash,
} from "../app/ai/scoring/scoreCandidate";

const inStock = {
  affinity: 5,
  interest: 2,
  pPurchase: 0.2,
  complementarity: 4,
  historicalConversion: 0.1,
  context: 0.5,
  priceFit: 0.8,
  availableForSale: true,
  inventoryQuantity: 12,
  businessValue: 0.4,
  repetition: 0,
  inCart: false,
};

describe("AI candidate scorer", () => {
  it("documents Standard weights used in the total", () => {
    expect(SCORE_WEIGHTS).toEqual({
      affinity: 1.0,
      interest: 0.8,
      pPurchase: 1.2,
      complementarity: 0.9,
      historicalConversion: 0.7,
      context: 0.4,
      priceFit: 0.5,
      inventory: 0.6,
      businessValue: 0.3,
      repetitionPenalty: 0.8,
      inCartPenalty: 2.0,
    });
    const scored = scoreCandidate(inStock);
    expect(scored.weights).toBe(SCORE_WEIGHTS);
    const reconstructed =
      scored.parts.affinity +
      scored.parts.interest +
      scored.parts.pPurchase +
      scored.parts.complementarity +
      scored.parts.historicalConversion +
      scored.parts.context +
      scored.parts.priceFit +
      scored.parts.inventory +
      scored.parts.businessValue -
      scored.parts.repetitionPenalty -
      scored.parts.inCartPenalty;
    expect(scored.total).toBeCloseTo(reconstructed, 4);
  });

  it("penalizes out-of-stock and low inventory vs in-stock", () => {
    const healthy = scoreCandidate(inStock);
    const low = scoreCandidate({ ...inStock, inventoryQuantity: 1 });
    const empty = scoreCandidate({ ...inStock, inventoryQuantity: 0 });
    const unavailable = scoreCandidate({ ...inStock, availableForSale: false, inventoryQuantity: 50 });

    expect(inventoryFactor({ availableForSale: true, inventoryQuantity: 12 })).toBe(1);
    expect(inventoryFactor({ availableForSale: true, inventoryQuantity: 2 })).toBe(0.4);
    expect(inventoryFactor({ availableForSale: true, inventoryQuantity: 0 })).toBe(0);
    expect(inventoryFactor({ availableForSale: false, inventoryQuantity: 50 })).toBe(0);

    expect(healthy.total).toBeGreaterThan(low.total);
    expect(low.total).toBeGreaterThan(empty.total);
    expect(empty.inventoryFactor).toBe(0);
    expect(unavailable.inventoryFactor).toBe(0);
    expect(empty.parts.inventory).toBe(0);
    expect(healthy.parts.inventory).toBe(SCORE_WEIGHTS.inventory);
  });

  it("applies an in-cart penalty so cart items rank below alternatives", () => {
    const outside = scoreCandidate(inStock);
    const inside = scoreCandidate({ ...inStock, inCart: true });
    expect(inside.parts.inCartPenalty).toBe(SCORE_WEIGHTS.inCartPenalty);
    expect(inside.total).toBe(Number((outside.total - SCORE_WEIGHTS.inCartPenalty).toFixed(4)));
    expect(compareCandidateScores(outside, inside)).toBeLessThan(0);
  });

  it("increases score when affinity or complementarity rises", () => {
    const base = scoreCandidate({ ...inStock, affinity: 0, complementarity: 0 });
    const moreAffinity = scoreCandidate({ ...inStock, affinity: 10, complementarity: 0 });
    const moreComp = scoreCandidate({ ...inStock, affinity: 0, complementarity: 10 });
    expect(moreAffinity.total).toBeGreaterThan(base.total);
    expect(moreComp.total).toBeGreaterThan(base.total);
    expect(squash(10)).toBeGreaterThan(squash(1));
  });
});
