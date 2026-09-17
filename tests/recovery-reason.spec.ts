import { describe, expect, it } from "vitest";
import { inferAbandonReason, RECOVERY_COPY, recoveryTemplateForReason } from "../app/ai/offer/recoveryReason";
import { selectExperience } from "../app/ai/experience/select";
import { selectOfferPolicy } from "../app/ai/offer/policy";

describe("recovery copy by abandon reason", () => {
  it("maps price / accessory / forgot to free-ship, accessory %, and reminder", () => {
    expect(inferAbandonReason({ discountSensitivity: 0.5 })).toBe("price");
    expect(inferAbandonReason({ strategies: ["complementary"] })).toBe("accessory");
    expect(inferAbandonReason({})).toBe("forgot");

    expect(recoveryTemplateForReason("forgot")).toBe("recovery_reminder");
    expect(recoveryTemplateForReason("price")).toBe("recovery_free_ship");
    expect(recoveryTemplateForReason("accessory")).toBe("recovery_accessory");
  });

  it("applies matching copy and offer on in-session recovery", () => {
    expect(
      selectExperience({
        requestedSurface: "product_page",
        intentState: "ABANDONING",
        abandonRisk: 0.8,
        abandonReason: "price",
      }),
    ).toMatchObject({
      templateId: "recovery_free_ship",
      headline: RECOVERY_COPY.price.headline,
      cta: RECOVERY_COPY.price.cta,
    });

    expect(
      selectExperience({
        requestedSurface: "popup",
        intentState: "ABANDONING",
        abandonRisk: 0.8,
        abandonReason: "accessory",
      }),
    ).toMatchObject({
      templateId: "recovery_accessory",
      headline: RECOVERY_COPY.accessory.headline,
    });

    expect(
      selectOfferPolicy({
        show: true,
        intentState: "ABANDONING",
        purchaseIntent: 0.5,
        maxDiscountPercent: 15,
        recoveryReason: "accessory",
      }),
    ).toEqual({ type: "percent", value: 10 });
  });
});
