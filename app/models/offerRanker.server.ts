import { OfferEventType } from "@prisma/client";
import db from "../db.server";
import { loadRecentActivity, type IdentityLookup } from "./browseActivity.server";
import { MAX_UPSELL_PRODUCTS, type EligibleOfferPayload } from "./offerEligibility.server";

const RECENCY_HALF_LIFE_HOURS = 48;
const CONVERSION_WEIGHT = 0.35;
const PRODUCT_AFFINITY_WEIGHT = 5;
const CART_ADD_AFFINITY_WEIGHT = 2;

function recencyWeight(occurredAt: Date, now: Date): number {
  const hours = Math.max(0, (now.getTime() - occurredAt.getTime()) / (1000 * 60 * 60));
  return Math.exp(-hours / RECENCY_HALF_LIFE_HOURS);
}

async function getOfferConversionPriors(
  shop: string,
  offerIds: string[],
): Promise<Map<string, number>> {
  const priors = new Map<string, number>();
  if (offerIds.length === 0) return priors;

  const [views, purchases] = await Promise.all([
    db.offerEvent.groupBy({
      by: ["offerId"],
      where: { shop, offerId: { in: offerIds }, eventType: OfferEventType.viewed },
      _count: { _all: true },
    }),
    db.offerEvent.groupBy({
      by: ["offerId"],
      where: { shop, offerId: { in: offerIds }, eventType: OfferEventType.purchased },
      _count: { _all: true },
    }),
  ]);

  const viewMap = new Map(views.map((row) => [row.offerId, row._count._all]));
  const purchaseMap = new Map(purchases.map((row) => [row.offerId, row._count._all]));

  for (const offerId of offerIds) {
    const viewCount = viewMap.get(offerId) ?? 0;
    const purchaseCount = purchaseMap.get(offerId) ?? 0;
    priors.set(offerId, viewCount > 0 ? purchaseCount / viewCount : 0);
  }

  return priors;
}

export async function rankEligibleOffers(options: {
  shop: string;
  offers: EligibleOfferPayload[];
  identity: IdentityLookup;
  max?: number;
}): Promise<EligibleOfferPayload[]> {
  const { shop, offers, identity } = options;
  const max = options.max ?? MAX_UPSELL_PRODUCTS;
  if (offers.length <= 1) return offers.slice(0, max);

  const activity = await loadRecentActivity(shop, identity);
  if (activity.length === 0) return offers.slice(0, max);

  const now = new Date();
  const viewedProducts = new Map<string, number>();
  const cartAddedProducts = new Map<string, number>();

  for (const row of activity) {
    const weight = recencyWeight(row.occurredAt, now);
    if (row.productId) {
      viewedProducts.set(row.productId, (viewedProducts.get(row.productId) ?? 0) + weight);
      if (row.eventType === "product_added_to_cart") {
        cartAddedProducts.set(row.productId, (cartAddedProducts.get(row.productId) ?? 0) + weight);
      }
    }
  }

  const uniqueOfferIds = Array.from(new Set(offers.map((offer) => offer.offerId)));
  const conversionPriors = await getOfferConversionPriors(shop, uniqueOfferIds);

  const scored = offers.map((offer, index) => {
    const productAffinity = viewedProducts.get(offer.productId) ?? 0;
    const cartAffinity = cartAddedProducts.get(offer.productId) ?? 0;
    const conversion = conversionPriors.get(offer.offerId) ?? 0;
    const score =
      productAffinity * PRODUCT_AFFINITY_WEIGHT +
      cartAffinity * CART_ADD_AFFINITY_WEIGHT +
      conversion * CONVERSION_WEIGHT;
    return { offer, index, score };
  });

  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.slice(0, max).map((row) => row.offer);
}
