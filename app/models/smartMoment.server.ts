import { OfferPlacement, OfferType } from "@prisma/client";
import db from "../db.server";
import { createOffer } from "./offer.server";
import { findVariantsByProductIds } from "./productVariant.server";

export async function listSmartMoments(shop: string) {
  const rows = await db.smartMoment.findMany({
    where: { shop },
    take: 50,
  });
  const rank: Record<string, number> = { detected: 0, activated: 1, dismissed: 2 };
  return rows.sort(
    (a, b) =>
      (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || b.expectedImpact - a.expectedImpact,
  );
}

export async function dismissSmartMoment(shop: string, id: string) {
  const result = await db.smartMoment.updateMany({
    where: { shop, id, status: "detected" },
    data: { status: "dismissed" },
  });
  return result.count > 0;
}

/**
 * Standard Activate: draft offer + draft campaign (holdout experiment still
 * wraps via createOffer). Never sets isActive / campaign status active.
 */
export async function activateSmartMoment(shop: string, id: string) {
  const moment = await db.smartMoment.findFirst({ where: { shop, id } });
  if (!moment) return { ok: false as const, error: "Moment not found." };
  if (moment.status === "activated" && moment.campaignId) {
    return { ok: true as const, campaignId: moment.campaignId, offerId: moment.offerId };
  }
  if (moment.status === "dismissed") {
    return { ok: false as const, error: "Dismissed moments cannot be activated." };
  }

  const variants = await findVariantsByProductIds(shop, [moment.relatedProductId]);
  const variantId = variants[0]?.variantId ?? moment.relatedProductId;

  const offer = await createOffer(shop, {
    title: `Smart Moment ${moment.kind.replace(/_/g, " ")}`,
    type: OfferType.cross_sell,
    placement: OfferPlacement.product_page,
    triggerProductIds: [moment.productId],
    targetProductIds: [moment.productId],
    isActive: false,
    status: "Draft",
    upsellProduct: "manual",
    displayLocation: "product_page",
    offerType: "as-is",
    promotionalTitle: moment.explanation,
    manualSelections: [{ productId: moment.relatedProductId, variantId }],
    triggerRules: {
      smartMomentId: moment.id,
      expectedImpact: moment.expectedImpact,
      lift: moment.lift,
    },
  });

  const campaign = await db.campaign.findFirst({
    where: { shop, offerId: offer.id },
    select: { id: true, status: true },
  });

  await db.smartMoment.update({
    where: { id: moment.id },
    data: {
      status: "activated",
      offerId: offer.id,
      campaignId: campaign?.id ?? null,
    },
  });

  return {
    ok: true as const,
    campaignId: campaign?.id ?? null,
    offerId: offer.id,
    campaignStatus: campaign?.status ?? "draft",
  };
}
