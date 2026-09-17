import { describe, expect, it } from "vitest";
import { fallbackExperience, selectExperience } from "../app/ai/experience/select";
import { buildDecideResponse } from "../app/ai/decide/decide.server";

describe("experience selection", () => {
  it("maps cart and thank-you to in-flow channels", () => {
    expect(selectExperience({ requestedSurface: "cart", intentState: "EXPLORING" })).toMatchObject({
      channel: "cart",
      templateId: "complete_the_setup",
    });
    expect(selectExperience({ requestedSurface: "thank_you", intentState: "LOYAL" })).toMatchObject({
      channel: "thank_you",
      templateId: "post_purchase",
    });
  });

  it("uses inline soft recs on PDP while exploring", () => {
    const selected = selectExperience({
      requestedSurface: "product_page",
      intentState: "EXPLORING",
    });
    expect(selected.channel).toBe("product_page");
    expect(selected.templateId).toBe("soft_recs");
    expect(selected.headline).toBe("You might also like");
  });

  it("uses popup wait-you-forgot on exit or abandoning popup", () => {
    expect(
      selectExperience({
        requestedSurface: "product_page",
        intentState: "HIGH_INTENT",
        timingTrigger: "exit",
        exitIntent: true,
      }),
    ).toMatchObject({ channel: "popup", templateId: "wait_you_forgot" });

    expect(
      selectExperience({
        requestedSurface: "popup",
        intentState: "ABANDONING",
      }),
    ).toMatchObject({ channel: "popup", templateId: "wait_you_forgot" });
  });

  it("uses sticky on scroll and honors a requested sticky surface", () => {
    expect(
      selectExperience({
        requestedSurface: "product_page",
        intentState: "COMPARING",
        timingTrigger: "scroll",
      }),
    ).toMatchObject({ channel: "sticky" });
    expect(selectExperience({ requestedSurface: "sticky", intentState: "HIGH_INTENT" }).channel).toBe("sticky");
    expect(fallbackExperience(selectExperience({ requestedSurface: "sticky", intentState: "EXPLORING" }))?.channel).toBe(
      "product_page",
    );
  });

  it("falls back from popup/sidebar to inline when interruption is too high", () => {
    const popup = selectExperience({
      requestedSurface: "popup",
      intentState: "RESEARCHING",
    });
    expect(fallbackExperience(popup)?.channel).toBe("product_page");
    expect(fallbackExperience(selectExperience({ requestedSurface: "cart", intentState: "READY_TO_BUY" }))).toBeNull();
  });

  it("writes experience and copy onto the decide response", () => {
    const selected = selectExperience({
      requestedSurface: "product_page",
      intentState: "RETURNING",
    });
    const response = buildDecideResponse({
      surface: "product_page",
      holdout: false,
      recommendationId: "rec-exp",
      products: [
        {
          productId: "gid://shopify/Product/1",
          variantId: null,
          strategy: "similar",
          score: 0.7,
        },
      ],
      intent: { state: "RETURNING", purchaseIntent: 0.4 },
      experience: selected,
    });
    expect(response.experience).toEqual({ channel: "product_page", templateId: "welcome_back" });
    expect(response.copy).toEqual({ headline: "Welcome back", cta: "Continue" });
    expect(response.show).toBe(true);
  });
});
