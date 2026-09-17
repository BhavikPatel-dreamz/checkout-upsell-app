import { describe, expect, it } from "vitest";
import { computeIncrementality } from "../app/ai/learn/incrementality";

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
});
