import { describe, expect, it } from "vitest";
import { inferIntent } from "../app/ai/intent/heuristics";

const now = new Date("2026-09-17T12:00:00.000Z");

describe("shopper intent heuristics", () => {
  it("defaults to exploring with empty history", () => {
    const inferred = inferIntent([], now);
    expect(inferred.state).toBe("EXPLORING");
    expect(inferred.purchaseIntent).toBe(0);
  });

  it("detects researching, comparing, high intent, ready to buy, abandoning, and loyal", () => {
    expect(
      inferIntent(
        [
          { name: "product_search", occurredAt: now },
          { name: "product_view", productId: "p1", occurredAt: now },
        ],
        now,
      ).state,
    ).toBe("RESEARCHING");

    expect(
      inferIntent(
        [
          { name: "product_view", productId: "p1", occurredAt: now },
          { name: "product_view", productId: "p2", occurredAt: now },
          { name: "product_view", productId: "p3", occurredAt: now },
        ],
        now,
      ).state,
    ).toBe("COMPARING");

    expect(
      inferIntent([{ name: "add_to_cart", productId: "p1", occurredAt: now }], now).state,
    ).toBe("HIGH_INTENT");

    expect(
      inferIntent([{ name: "checkout_started", occurredAt: now }], now).state,
    ).toBe("READY_TO_BUY");

    expect(
      inferIntent(
        [
          { name: "add_to_cart", productId: "p1", occurredAt: new Date(now.getTime() - 2 * 3600_000) },
          { name: "remove_from_cart", productId: "p1", occurredAt: new Date(now.getTime() - 1 * 3600_000) },
        ],
        now,
      ).state,
    ).toBe("ABANDONING");

    expect(
      inferIntent(
        [
          { name: "purchase", productId: "p1", occurredAt: new Date(now.getTime() - 10 * 86400_000) },
          { name: "purchase", productId: "p2", occurredAt: new Date(now.getTime() - 2 * 86400_000) },
        ],
        now,
      ).state,
    ).toBe("LOYAL");
  });
});
