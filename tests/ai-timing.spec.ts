import { describe, expect, it } from "vitest";
import {
  evaluateTiming,
  expectedIncrementalValue,
  INTERRUPTION_COST,
  TIMING_MIN_DWELL_MS,
} from "../app/ai/timing/timing";
import { buildDecideResponse } from "../app/ai/decide/decide.server";

const strongProduct = {
  productId: "gid://shopify/Product/2",
  variantId: null,
  strategy: "complementary",
  score: 0.9,
};

describe("timing engine", () => {
  it("hides when expected value is below interruption cost", () => {
    const weak = expectedIncrementalValue({
      maxScore: 0.1,
      purchaseIntent: 0,
      cartValue: 0,
      exitIntent: false,
    });
    expect(weak).toBeLessThan(INTERRUPTION_COST.product_page);

    const decision = evaluateTiming({
      surface: "product_page",
      dwellMs: TIMING_MIN_DWELL_MS,
      scrollDepth: 0.9,
      purchaseIntent: 0,
      maxScore: 0.1,
      productCount: 1,
    });
    expect(decision.show).toBe(false);
    expect(decision.trigger).toBe("suppressed");
    expect(decision.reason).toBe("low_expected_value");
  });

  it("waits for dwell on PDP even when expected value is high", () => {
    const decision = evaluateTiming({
      surface: "product_page",
      dwellMs: 1_000,
      purchaseIntent: 0.6,
      maxScore: 0.9,
      productCount: 1,
    });
    expect(decision.show).toBe(false);
    expect(decision.trigger).toBe("dwell");
    expect(decision.reason).toBe("wait_dwell");
    expect(decision.delayMs).toBe(TIMING_MIN_DWELL_MS - 1_000);
  });

  it("shows after dwell, scroll, exit, or cart-value signals", () => {
    const dwell = evaluateTiming({
      surface: "product_page",
      dwellMs: TIMING_MIN_DWELL_MS,
      purchaseIntent: 0.6,
      maxScore: 0.9,
      productCount: 1,
    });
    expect(dwell.show).toBe(true);
    expect(dwell.trigger).toBe("dwell");

    const scroll = evaluateTiming({
      surface: "sidebar",
      scrollDepth: 0.5,
      purchaseIntent: 0.8,
      maxScore: 0.95,
      productCount: 1,
    });
    expect(scroll.show).toBe(true);
    expect(scroll.trigger).toBe("scroll");

    const exit = evaluateTiming({
      surface: "popup",
      exitIntent: true,
      purchaseIntent: 0.9,
      maxScore: 0.95,
      cartValue: 40,
      productCount: 1,
    });
    expect(exit.show).toBe(true);
    expect(exit.trigger).toBe("exit");

    const cartValue = evaluateTiming({
      surface: "product_page",
      cartValue: 40,
      purchaseIntent: 0.5,
      maxScore: 0.8,
      productCount: 1,
    });
    expect(cartValue.show).toBe(true);
    expect(cartValue.trigger).toBe("cart_value");
  });

  it("gates decide show=false when timing suppresses", () => {
    const timing = evaluateTiming({
      surface: "popup",
      purchaseIntent: 0,
      maxScore: 0.2,
      productCount: 1,
    });
    const response = buildDecideResponse({
      surface: "popup",
      holdout: false,
      products: [strongProduct],
      recommendationId: "rec-t",
      timing,
    });
    expect(response.show).toBe(false);
    expect(response.timing.reason).toBe("low_expected_value");
    expect(response.products).toHaveLength(1);
  });
});
