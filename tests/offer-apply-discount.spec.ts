import { describe, expect, it } from "vitest";
import {
  functionDiscountForPolicy,
  policyFromMerchantDeal,
  upsellDiscountAttributes,
} from "../app/ai/offer/applyDiscount";

describe("function discount application", () => {
  it("maps merchant discount/free deals under the max and leaves as-is as none", () => {
    expect(policyFromMerchantDeal({ dealType: "discount", discountValue: 40, maxDiscountPercent: 15 })).toEqual({
      type: "percent",
      value: 15,
    });
    expect(policyFromMerchantDeal({ dealType: "free", discountValue: null, maxDiscountPercent: 10 })).toEqual({
      type: "percent",
      value: 10,
    });
    expect(policyFromMerchantDeal({ dealType: "as-is", discountValue: 20, maxDiscountPercent: 15 })).toEqual({
      type: "none",
      value: null,
    });
  });

  it("applies only percent, amount, and free_shipping; skips bundle/upgrade/none", () => {
    expect(
      functionDiscountForPolicy({
        policyType: "percent",
        policyValue: 20,
        maxDiscountPercent: 15,
      }),
    ).toEqual({ kind: "product_percent", percent: 15 });

    expect(
      functionDiscountForPolicy({
        policyType: "amount",
        policyValue: 12,
        maxDiscountPercent: 10,
        linePrice: 50,
      }),
    ).toEqual({ kind: "product_amount", amount: 5 });

    expect(
      functionDiscountForPolicy({
        policyType: "free_shipping",
        policyValue: null,
        maxDiscountPercent: 15,
      }),
    ).toEqual({ kind: "shipping_percent", percent: 100 });

    for (const type of ["none", "bundle", "upgrade"]) {
      expect(
        functionDiscountForPolicy({
          policyType: type,
          policyValue: 10,
          maxDiscountPercent: 15,
        }),
      ).toEqual({ kind: "none" });
    }
  });

  it("stamps cart line attributes the Function reads", () => {
    expect(upsellDiscountAttributes({ type: "percent", value: 10 }, 15)).toEqual({
      _upsell_policy: "percent",
      _upsell_policy_value: "10",
      _upsell_max_discount: "15",
    });
  });
});
