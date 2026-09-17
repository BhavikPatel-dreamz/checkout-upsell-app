import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPTIMIZATION_GOAL,
  normalizeOptimizationGoal,
  primaryIncrementForGoal,
} from "../app/ai/learn/goal";
import { SCORE_WEIGHTS, scoreWeightsForGoal } from "../app/ai/scoring/scoreCandidate";
import { merchantRuleSetFromForm } from "../app/models/merchantRuleSet.server";

describe("optimization goal (AI-5.5)", () => {
  it("defaults unknown values to revenue", () => {
    expect(normalizeOptimizationGoal(undefined)).toBe(DEFAULT_OPTIMIZATION_GOAL);
    expect(normalizeOptimizationGoal("clicks")).toBe("revenue");
  });

  it("keeps profit only when margin data is allowed", () => {
    expect(normalizeOptimizationGoal("profit")).toBe("profit");
    expect(normalizeOptimizationGoal("profit", { allowProfit: false })).toBe("revenue");
    expect(normalizeOptimizationGoal("profit", { allowProfit: true })).toBe("profit");
  });

  it("maps incrementality stats to the shop goal", () => {
    const stats = {
      incrementalRevenue: 40,
      treatedAov: 80,
      holdoutAov: 70,
      treatedConversion: 0.2,
      holdoutConversion: 0.1,
    };
    expect(primaryIncrementForGoal("revenue", stats).value).toBe(40);
    expect(primaryIncrementForGoal("aov", stats).value).toBe(10);
    expect(primaryIncrementForGoal("conversion", stats).unit).toBe("points");
    expect(primaryIncrementForGoal("profit", stats, { minMarginPercent: 25 }).value).toBe(10);
    expect(primaryIncrementForGoal("profit", stats, { minMarginPercent: null }).value).toBe(40);
  });

  it("tilts scoring weights by goal without replacing the scorer", () => {
    expect(scoreWeightsForGoal("revenue")).toBe(SCORE_WEIGHTS);
    expect(scoreWeightsForGoal("aov").businessValue).toBeGreaterThan(SCORE_WEIGHTS.businessValue);
    expect(scoreWeightsForGoal("conversion").historicalConversion).toBeGreaterThan(
      SCORE_WEIGHTS.historicalConversion,
    );
    expect(scoreWeightsForGoal("profit").businessValue).toBeGreaterThan(SCORE_WEIGHTS.businessValue);
  });

  it("parses the settings form and falls profit back without min margin", () => {
    const withMargin = new FormData();
    withMargin.set("maxN", "5");
    withMargin.set("minMarginPercent", "20");
    withMargin.set("optimizationGoal", "profit");
    expect(merchantRuleSetFromForm(withMargin).optimizationGoal).toBe("profit");

    const noMargin = new FormData();
    noMargin.set("maxN", "5");
    noMargin.set("optimizationGoal", "profit");
    expect(merchantRuleSetFromForm(noMargin).optimizationGoal).toBe("revenue");
  });
});
