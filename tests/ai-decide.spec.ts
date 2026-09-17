import { describe, expect, it } from "vitest";
import { decideRequestSchema, identityKey } from "../app/ai/decide/contract";
import { buildDecideResponse } from "../app/ai/decide/decide.server";
import { assignHoldout, DEFAULT_HOLDOUT_RATE } from "../app/ai/decide/holdout";

describe("POST /api/ai/decide contract and holdout", () => {
  it("parses the request and returns the stable response shape", () => {
    const parsed = decideRequestSchema.parse({
      shop: "decide-test.myshopify.com",
      surface: "sidebar",
      productIds: ["gid://shopify/Product/1"],
      cartProductIds: ["gid://shopify/Product/1"],
      anonId: "anon-1",
    });
    expect(parsed.surface).toBe("sidebar");

    const shown = buildDecideResponse({
      surface: "sidebar",
      holdout: false,
      recommendationId: "rec-1",
      products: [
        {
          productId: "gid://shopify/Product/2",
          variantId: "gid://shopify/ProductVariant/2",
          strategy: "complementary",
          score: 0.87,
        },
      ],
    });
    expect(shown).toEqual({
      show: true,
      experience: { channel: "sidebar", templateId: "default" },
      products: [
        {
          productId: "gid://shopify/Product/2",
          variantId: "gid://shopify/ProductVariant/2",
          strategy: "complementary",
          score: 0.87,
        },
      ],
      offer: { type: "none", value: null },
      copy: { headline: "", cta: "" },
      recommendationId: "rec-1",
      intent: { state: "EXPLORING", purchaseIntent: 0 },
      holdout: false,
      timing: {
        delayMs: 0,
        trigger: "immediate",
        expectedValue: 1,
        interruptionCost: 0,
        reason: "passthrough",
      },
    });
  });

  it("assigns sticky holdout and suppresses products when held out", () => {
    expect(DEFAULT_HOLDOUT_RATE).toBe(0.1);
    const shop = "holdout.myshopify.com";
    const id = identityKey({ anonId: "sticky-anon" });
    const first = assignHoldout(shop, id, 0.5);
    const second = assignHoldout(shop, id, 0.5);
    expect(second).toBe(first);
    expect(assignHoldout(shop, id, 0)).toBe(false);
    expect(assignHoldout(shop, id, 1)).toBe(true);

    const held = buildDecideResponse({
      surface: "product_page",
      holdout: true,
      recommendationId: "rec-hold",
      products: [
        {
          productId: "gid://shopify/Product/9",
          variantId: null,
          strategy: "fbt",
          score: 1,
        },
      ],
    });
    expect(held.show).toBe(false);
    expect(held.holdout).toBe(true);
    expect(held.products).toEqual([]);
    expect(held.recommendationId).toBe("rec-hold");
  });
});
