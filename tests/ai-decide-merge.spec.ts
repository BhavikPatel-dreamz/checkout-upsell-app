import { describe, expect, it } from "vitest";
import { mergeEligibleWithDecide } from "../app/ai/experience/mergeDecideOffers";

describe("cart/thank-you decide merge", () => {
  const eligible = [
    { productId: "gid://shopify/Product/1", title: "A" },
    { productId: "gid://shopify/Product/2", title: "B" },
  ];

  it("hides merchant offers when decide says show false", () => {
    expect(mergeEligibleWithDecide({ show: false, products: [{ productId: "gid://shopify/Product/1" }] }, eligible)).toEqual(
      [],
    );
    expect(mergeEligibleWithDecide(null, eligible)).toEqual([]);
  });

  it("keeps eligible rows that decide recommended", () => {
    expect(
      mergeEligibleWithDecide(
        { show: true, products: [{ productId: "gid://shopify/Product/2" }] },
        eligible,
      ),
    ).toEqual([{ productId: "gid://shopify/Product/2", title: "B" }]);
  });

  it("falls back to the merchant pool when decide has no overlapping products", () => {
    expect(
      mergeEligibleWithDecide(
        { show: true, products: [{ productId: "gid://shopify/Product/9" }] },
        eligible,
      ),
    ).toEqual(eligible);
  });
});
