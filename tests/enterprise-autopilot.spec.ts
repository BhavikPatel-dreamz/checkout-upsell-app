import { describe, expect, it } from "vitest";
import { autopilotMayPublish, isEnterpriseShop } from "../app/enterprise/tier";

describe("Enterprise autopilot publish (AI-6.4)", () => {
  it("never treats an unlisted Standard shop as Enterprise", () => {
    expect(isEnterpriseShop("acme.myshopify.com", {})).toBe(false);
    expect(isEnterpriseShop("acme.myshopify.com", { AI_TIER: "standard" })).toBe(false);
    expect(
      autopilotMayPublish({ enterprise: false, autopilotEnabled: true }),
    ).toBe(false);
  });

  it("allows autopilot only for Enterprise shops that opted in", () => {
    expect(isEnterpriseShop("client.myshopify.com", { AI_TIER: "enterprise" })).toBe(true);
    expect(
      isEnterpriseShop("client.myshopify.com", {
        ENTERPRISE_SHOPS: "other.myshopify.com, client.myshopify.com",
      }),
    ).toBe(true);
    expect(
      autopilotMayPublish({ enterprise: true, autopilotEnabled: false }),
    ).toBe(false);
    expect(
      autopilotMayPublish({ enterprise: true, autopilotEnabled: true }),
    ).toBe(true);
  });
});
