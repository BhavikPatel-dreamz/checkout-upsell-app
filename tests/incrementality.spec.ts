import { describe, expect, it } from "vitest";
import {
  cohortOrdersAndRevenue,
  computeIncrementality,
  incrementalitySurfaceFor,
} from "../app/ai/learn/incrementality";

describe("incrementality rollup", () => {
  it("computes incremental revenue, AOV, and conversion vs holdout", () => {
    const stats = computeIncrementality(
      { users: 90, orders: 18, revenue: 1800 },
      { users: 10, orders: 1, revenue: 80 },
    );
    expect(stats.treatedConversion).toBeCloseTo(0.2);
    expect(stats.holdoutConversion).toBeCloseTo(0.1);
    expect(stats.treatedAov).toBe(100);
    expect(stats.holdoutAov).toBe(80);
    // treated RPU 20, holdout RPU 8 → lift $12 * 90 treated
    expect(stats.incrementalRevenue).toBe(1080);
  });

  it("returns zero incremental when holdout is empty", () => {
    expect(
      computeIncrementality({ users: 5, orders: 1, revenue: 50 }, { users: 0, orders: 0, revenue: 0 })
        .incrementalRevenue,
    ).toBe(0);
  });

  it("uses checkout total when an attributed purchase event has no revenue", () => {
    const { orders, revenue } = cohortOrdersAndRevenue({
      shopper: [
        { eventId: "checkout_completed:gid://shopify/Order/1", context: { cartValue: 42.5 } },
        { eventId: "purchase:gid://shopify/Order/1:line-1", context: {} },
      ],
      offers: [{ orderId: "gid://shopify/Order/1", revenue: null, customerId: "c1", guestKey: null }],
    });
    expect(orders).toBe(1);
    expect(revenue).toBe(42.5);
  });

  it("maps decide channels onto PDP, cart, popup, thank-you, and recovery", () => {
    expect(incrementalitySurfaceFor({ channel: "product_page" })).toBe("pdp");
    expect(incrementalitySurfaceFor({ channel: "sidebar" })).toBe("pdp");
    expect(incrementalitySurfaceFor({ channel: "cart" })).toBe("cart");
    expect(incrementalitySurfaceFor({ channel: "popup" })).toBe("popup");
    expect(incrementalitySurfaceFor({ channel: "thank_you" })).toBe("thank_you");
    expect(
      incrementalitySurfaceFor({
        channel: "popup",
        templateId: "recovery_free_ship",
        reason: "recovery_price",
      }),
    ).toBe("recovery");
  });
});
