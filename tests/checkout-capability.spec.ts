import { describe, expect, it } from "vitest";
import { checkoutCapabilityAllows } from "../app/models/shopCapability.server";

describe("checkout Plus capability", () => {
  it("allows Shopify Plus and partner development stores", () => {
    const previous = process.env.AI_CHECKOUT_PLUS;
    delete process.env.AI_CHECKOUT_PLUS;
    expect(checkoutCapabilityAllows({ shopifyPlus: true, partnerDevelopment: false })).toBe(true);
    expect(checkoutCapabilityAllows({ shopifyPlus: false, partnerDevelopment: true })).toBe(true);
    expect(checkoutCapabilityAllows({ shopifyPlus: false, partnerDevelopment: false })).toBe(false);
    if (previous === undefined) delete process.env.AI_CHECKOUT_PLUS;
    else process.env.AI_CHECKOUT_PLUS = previous;
  });
});
