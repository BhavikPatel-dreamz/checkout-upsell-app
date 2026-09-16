import { OfferType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { EligibleOfferPayload } from "../app/models/eligibleOffer";
import {
  LLM_TOP_K,
  applyLlmPoolOrder,
  llmPickerEnabled,
  parseLlmPoolIds,
  pickPoolWithOptionalLlm,
  splitLlmTopK,
} from "../app/models/offerLlmPicker.server";

function item(id: string): EligibleOfferPayload {
  return {
    offerId: "o",
    offerName: "AI",
    productId: `gid://shopify/Product/${id}`,
    variantId: `gid://shopify/ProductVariant/${id}`,
    productHandle: null,
    productTitle: id,
    variantTitle: null,
    imageUrl: null,
    price: "10",
    offerType: OfferType.ai_recommend,
    discountValue: null,
  };
}

describe("optional LLM top-K picker", () => {
  it("is opt-in and does not invent candidates", () => {
    expect(LLM_TOP_K).toBe(8);
    expect(llmPickerEnabled()).toBe(false);

    const pool = [item("1"), item("2"), item("3")];
    const allowed = new Set(pool.flatMap((row) => [row.variantId, row.productId]));
    expect(parseLlmPoolIds('["gid://shopify/ProductVariant/2","gid://shopify/Product/999"]', allowed)).toEqual([
      "gid://shopify/ProductVariant/2",
    ]);

    const ordered = applyLlmPoolOrder(pool, [
      "gid://shopify/ProductVariant/2",
      "gid://shopify/Product/invented",
      "gid://shopify/ProductVariant/1",
    ]);
    expect(ordered.map((row) => row.variantId)).toEqual([
      "gid://shopify/ProductVariant/2",
      "gid://shopify/ProductVariant/1",
      "gid://shopify/ProductVariant/3",
    ]);
    expect(ordered).toHaveLength(pool.length);
  });

  it("splits only the head for the model and leaves the tail untouched", () => {
    const pool = [item("1"), item("2"), item("3"), item("4")];
    const { head, tail } = splitLlmTopK(pool, 2);
    expect(head.map((row) => row.variantId)).toEqual([
      "gid://shopify/ProductVariant/1",
      "gid://shopify/ProductVariant/2",
    ]);
    expect(tail.map((row) => row.variantId)).toEqual([
      "gid://shopify/ProductVariant/3",
      "gid://shopify/ProductVariant/4",
    ]);
  });

  it("returns the scored pool unchanged when the LLM is off", async () => {
    const pool = [item("1"), item("2")];
    const result = await pickPoolWithOptionalLlm({
      shop: "llm-off.myshopify.com",
      offerId: "offer-1",
      identity: {},
      pool,
      activity: [],
    });
    expect(result).toEqual(pool);
  });
});
