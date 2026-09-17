import { OfferPlacement } from "@prisma/client";
import db from "../db.server";
import type { DecideSurface } from "../ai/decide/contract";
import { ensureAbExperiment } from "./experiment.server";
import { getMerchantRuleSet } from "./merchantRuleSet.server";

export function channelFromOfferPlacement(placement: OfferPlacement): DecideSurface {
  switch (placement) {
    case OfferPlacement.popup:
      return "popup";
    case OfferPlacement.sidebar:
      return "sidebar";
    case OfferPlacement.cart_drawer:
      return "cart";
    case OfferPlacement.checkout:
      return "checkout";
    case OfferPlacement.post_purchase:
    case OfferPlacement.order_status:
      return "thank_you";
    default:
      return "product_page";
  }
}

export async function wrapOfferAsCampaign(input: {
  shop: string;
  offerId: string;
  name: string;
  placement: OfferPlacement;
  isActive: boolean;
}): Promise<{ campaignId: string; experienceId: string }> {
  const channel = channelFromOfferPlacement(input.placement);
  const status = input.isActive ? "active" : "draft";
  const merchant = await getMerchantRuleSet(input.shop);
  const goal = merchant.optimizationGoal;

  const campaign = await db.campaign.upsert({
    where: { shop_offerId: { shop: input.shop, offerId: input.offerId } },
    create: {
      shop: input.shop,
      name: input.name,
      goal,
      status,
      offerId: input.offerId,
      rules: {
        create: { shop: input.shop },
      },
    },
    update: {
      name: input.name,
      status,
      goal,
    },
  });

  const experience = await db.experience.upsert({
    where: {
      shop_offerId_channel: {
        shop: input.shop,
        offerId: input.offerId,
        channel,
      },
    },
    create: {
      shop: input.shop,
      campaignId: campaign.id,
      offerId: input.offerId,
      channel,
      templateId: "default",
      variants: {
        create: [
          { shop: input.shop, layout: "control" },
          {
            shop: input.shop,
            layout: "treatment",
            headline: "A different take",
            cta: "See this instead",
          },
        ],
      },
    },
    update: {
      campaignId: campaign.id,
      channel,
    },
  });

  await ensureAbExperiment({
    shop: input.shop,
    experienceId: experience.id,
    campaignId: campaign.id,
    name: `${input.name} A/B`,
  });

  return { campaignId: campaign.id, experienceId: experience.id };
}

export async function findExperienceForChannel(shop: string, channel: string) {
  return db.experience.findFirst({
    where: {
      shop,
      channel,
      campaign: { status: "active" },
    },
    orderBy: { updatedAt: "desc" },
    include: { variants: { orderBy: { createdAt: "asc" } } },
  });
}
