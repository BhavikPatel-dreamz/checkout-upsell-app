import { describe, expect, it } from "vitest";
import { computePriceDiscountSensitivity } from "../app/ai/intent/sensitivity";
import { inferIntent } from "../app/ai/intent/heuristics";

const now = new Date("2026-09-17T12:00:00.000Z");

describe("price and discount sensitivity features", () => {
  it("stays near zero without price or deal signals", () => {
    const scores = computePriceDiscountSensitivity({
      events: [{ name: "page_view", occurredAt: now }],
    });
    expect(scores.priceSensitivity).toBe(0);
    expect(scores.discountSensitivity).toBe(0);
  });

  it("raises price sensitivity for wide viewed price bands, cheaper ATC, and price search", () => {
    const catalog = [
      { productId: "cheap", priceMin: 10, priceMax: 10, compareAtMax: null },
      { productId: "mid", priceMin: 40, priceMax: 40, compareAtMax: null },
      { productId: "premium", priceMin: 120, priceMax: 120, compareAtMax: null },
    ];
    const scores = computePriceDiscountSensitivity({
      catalog,
      events: [
        { name: "product_view", productId: "premium", occurredAt: now },
        { name: "product_view", productId: "mid", occurredAt: now },
        { name: "product_view", productId: "cheap", occurredAt: now },
        { name: "product_search", query: "cheap under $20", occurredAt: now },
        { name: "variant_select", productId: "cheap", occurredAt: now },
        { name: "remove_from_cart", productId: "premium", occurredAt: now },
        { name: "add_to_cart", productId: "cheap", occurredAt: now },
      ],
    });
    expect(scores.priceSensitivity).toBeGreaterThan(0.35);
    expect(scores.discountSensitivity).toBeLessThan(0.2);
  });

  it("raises discount sensitivity for on-sale views, sale search, and offer engagement", () => {
    const catalog = [
      { productId: "sale", priceMin: 20, priceMax: 20, compareAtMax: 40 },
      { productId: "full", priceMin: 20, priceMax: 20, compareAtMax: null },
    ];
    const scores = computePriceDiscountSensitivity({
      catalog,
      events: [
        { name: "product_view", productId: "sale", occurredAt: now },
        { name: "product_search", query: "summer sale discount", occurredAt: now },
        { name: "offer_view", occurredAt: now },
        { name: "offer_accept", occurredAt: now },
        { name: "popup_view", occurredAt: now },
        { name: "purchase", productId: "sale", occurredAt: now },
      ],
    });
    expect(scores.discountSensitivity).toBeGreaterThan(0.45);
    expect(scores.priceSensitivity).toBe(0);
  });

  it("writes the features onto the shopper profile inference", () => {
    const inferred = inferIntent(
      [
        { name: "product_view", productId: "sale", occurredAt: now },
        { name: "product_search", query: "clearance", occurredAt: now },
        { name: "offer_view", occurredAt: now },
      ],
      now,
      [{ productId: "sale", priceMin: 15, priceMax: 15, compareAtMax: 30 }],
    );
    expect(inferred.discountSensitivity).toBeGreaterThan(0.3);
    expect(inferred.priceSensitivity).toBe(0);
  });
});
