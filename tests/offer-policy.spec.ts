import { describe, expect, it } from "vitest";
import {
  clampOfferPolicy,
  DEFAULT_MAX_DISCOUNT_PERCENT,
  selectOfferPolicy,
} from "../app/ai/offer/policy";

describe("offer policy under merchant max discount", () => {
  it("clamps percent policies to the merchant max", () => {
    expect(clampOfferPolicy({ type: "percent", value: 40 }, 15)).toEqual({ type: "percent", value: 15 });
    expect(clampOfferPolicy({ type: "percent", value: 10 }, 0)).toEqual({ type: "none", value: null });
    expect(DEFAULT_MAX_DISCOUNT_PERCENT).toBe(15);
  });

  it("picks none / percent / bundle / free_shipping / upgrade from intent", () => {
    expect(
      selectOfferPolicy({
        show: false,
        intentState: "ABANDONING",
        purchaseIntent: 1,
        maxDiscountPercent: 15,
      }),
    ).toEqual({ type: "none", value: null });

    expect(
      selectOfferPolicy({
        show: true,
        intentState: "ABANDONING",
        purchaseIntent: 0.4,
        maxDiscountPercent: 8,
      }),
    ).toEqual({ type: "none", value: null });

    expect(
      selectOfferPolicy({
        show: true,
        intentState: "ABANDONING",
        purchaseIntent: 0.4,
        maxDiscountPercent: 8,
        recoveryReason: "price",
      }),
    ).toEqual({ type: "free_shipping", value: null });

    expect(
      selectOfferPolicy({
        show: true,
        intentState: "EXPLORING",
        purchaseIntent: 0.2,
        strategies: ["complementary"],
        maxDiscountPercent: 15,
      }),
    ).toEqual({ type: "bundle", value: null });

    expect(
      selectOfferPolicy({
        show: true,
        intentState: "RESEARCHING",
        purchaseIntent: 0.5,
        cartValue: 30,
        maxDiscountPercent: 15,
      }),
    ).toEqual({ type: "free_shipping", value: null });

    expect(
      selectOfferPolicy({
        show: true,
        intentState: "HIGH_INTENT",
        purchaseIntent: 0.7,
        strategies: ["similar"],
        maxDiscountPercent: 15,
      }),
    ).toEqual({ type: "upgrade", value: null });
  });
});
