import { OfferPlacement, OfferType, PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { channelFromOfferPlacement, wrapOfferAsCampaign } from "../app/models/campaign.server";
import { createOffer } from "../app/models/offer.server";

const db = new PrismaClient();
const SHOP = "campaign-wrap-test.myshopify.com";

describe("campaign + experience wrap Offer", () => {
  it("maps popup and sidebar placements to experience channels", () => {
    expect(channelFromOfferPlacement(OfferPlacement.popup)).toBe("popup");
    expect(channelFromOfferPlacement(OfferPlacement.sidebar)).toBe("sidebar");
    expect(channelFromOfferPlacement(OfferPlacement.product_page)).toBe("product_page");
  });

  it("wraps a created offer without a second form", async () => {
    await db.experienceVariant.deleteMany({ where: { shop: SHOP } });
    await db.experience.deleteMany({ where: { shop: SHOP } });
    await db.campaignRule.deleteMany({ where: { shop: SHOP } });
    await db.campaign.deleteMany({ where: { shop: SHOP } });
    await db.offer.deleteMany({ where: { shop: SHOP } });

    const offer = await createOffer(SHOP, {
      title: "Popup wrap",
      type: OfferType.cross_sell,
      placement: OfferPlacement.popup,
      targetProductIds: ["gid://shopify/Product/1"],
      manualSelections: [
        { productId: "gid://shopify/Product/2", variantId: "gid://shopify/ProductVariant/2" },
      ],
      displayLocation: "popup",
      offerType: "as-is",
    });

    const campaign = await db.campaign.findFirst({ where: { shop: SHOP, offerId: offer.id } });
    const experience = await db.experience.findFirst({
      where: { shop: SHOP, offerId: offer.id, channel: "popup" },
    });
    expect(campaign?.status).toBe("active");
    expect(experience?.campaignId).toBe(campaign?.id);

    const again = await wrapOfferAsCampaign({
      shop: SHOP,
      offerId: offer.id,
      name: offer.name,
      placement: OfferPlacement.popup,
      isActive: true,
    });
    expect(again.campaignId).toBe(campaign?.id);
  }, 20_000);
});
