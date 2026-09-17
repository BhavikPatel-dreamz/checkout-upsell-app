import db from "../db.server";

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

export function getSmartMoment(shop: string, id: string) {
  return db.smartMoment.findFirst({ where: { shop, id } });
}

export async function dismissSmartMoment(shop: string, id: string) {
  const result = await db.smartMoment.updateMany({
    where: { shop, id, status: "detected" },
    data: { status: "dismissed" },
  });
  return result.count > 0;
}

/**
 * After the merchant saves OfferForm, attach the draft offer/campaign.
 * Does not publish (isActive stays whatever OfferForm saved; callers force draft).
 */
export async function attachSmartMomentToOffer(shop: string, momentId: string, offerId: string) {
  const moment = await db.smartMoment.findFirst({ where: { shop, id: momentId } });
  if (!moment || moment.status === "dismissed") return null;
  const campaign = await db.campaign.findFirst({
    where: { shop, offerId },
    select: { id: true, status: true },
  });
  await db.smartMoment.update({
    where: { id: moment.id },
    data: {
      status: "activated",
      offerId,
      campaignId: campaign?.id ?? null,
    },
  });
  return { campaignId: campaign?.id ?? null, campaignStatus: campaign?.status ?? "draft" };
}
