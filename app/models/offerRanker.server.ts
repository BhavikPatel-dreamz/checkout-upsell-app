import { OfferEventType } from "@prisma/client";
import db from "../db.server";
import {
  loadRecentActivity,
  type BrowseActivityRow,
  type IdentityLookup,
} from "./browseActivity.server";
import { MAX_UPSELL_PRODUCTS, type EligibleOfferPayload } from "./eligibleOffer";
import { pickPoolWithOptionalLlm } from "./offerLlmPicker.server";

const RECENCY_HALF_LIFE_HOURS = 48;
const CONVERSION_WEIGHT = 0.35;
const PRODUCT_AFFINITY_WEIGHT = 5;
const CART_ADD_AFFINITY_WEIGHT = 2;
const VARIANT_AFFINITY_WEIGHT = 3;
const COLLECTION_AFFINITY_WEIGHT = 1.5;
const SEARCH_TITLE_WEIGHT = 1.2;
const TIME_ON_PAGE_WEIGHT = 0.8;

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

async function getProductConversionPriors(shop: string, productIds: string[]): Promise<Map<string, number>> {
  const priors = new Map<string, number>();
  if (productIds.length === 0) return priors;

  const [views, purchases] = await Promise.all([
    db.offerEvent.groupBy({
      by: ["productId"],
      where: {
        shop,
        productId: { in: productIds },
        eventType: OfferEventType.viewed,
      },
      _count: { _all: true },
    }),
    db.offerEvent.groupBy({
      by: ["productId"],
      where: {
        shop,
        productId: { in: productIds },
        eventType: OfferEventType.purchased,
      },
      _count: { _all: true },
    }),
  ]);

  const viewMap = new Map(views.map((row) => [row.productId ?? "", row._count._all]));
  const purchaseMap = new Map(purchases.map((row) => [row.productId ?? "", row._count._all]));
  for (const productId of productIds) {
    const viewCount = viewMap.get(productId) ?? 0;
    const purchaseCount = purchaseMap.get(productId) ?? 0;
    priors.set(productId, viewCount > 0 ? purchaseCount / viewCount : 0);
  }
  return priors;
}

function tokenize(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length > 2);
}

export function scorePoolAgainstActivity(
  pool: EligibleOfferPayload[],
  activity: BrowseActivityRow[],
  conversionByProduct: Map<string, number>,
  now = new Date(),
): EligibleOfferPayload[] {
  if (pool.length <= 1) return pool.slice();
  if (activity.length === 0) return pool.slice();

  const viewedProducts = new Map<string, number>();
  const cartAddedProducts = new Map<string, number>();
  const viewedVariants = new Map<string, number>();
  const viewedCollections = new Map<string, number>();
  const searchTokens = new Map<string, number>();
  const timeOnPage = new Map<string, number>();

  for (const row of activity) {
    const weight = recencyWeight(row.occurredAt, now);
    if (row.productId) {
      viewedProducts.set(row.productId, (viewedProducts.get(row.productId) ?? 0) + weight);
      if (row.eventType === "product_added_to_cart") {
        cartAddedProducts.set(row.productId, (cartAddedProducts.get(row.productId) ?? 0) + weight);
      }
      if (row.eventType === "time_on_page") {
        const bucket = Number(row.query) || 0;
        timeOnPage.set(row.productId, (timeOnPage.get(row.productId) ?? 0) + weight * Math.min(bucket / 45, 3));
      }
    }
    if (row.variantId) {
      viewedVariants.set(row.variantId, (viewedVariants.get(row.variantId) ?? 0) + weight);
    }
    if (row.collectionId) {
      viewedCollections.set(row.collectionId, (viewedCollections.get(row.collectionId) ?? 0) + weight);
    }
    for (const token of tokenize(row.query)) {
      if (row.eventType === "time_on_page") continue;
      searchTokens.set(token, (searchTokens.get(token) ?? 0) + weight);
    }
  }

  const scored = pool.map((offer, index) => {
    const productAffinity = viewedProducts.get(offer.productId) ?? 0;
    const cartAffinity = cartAddedProducts.get(offer.productId) ?? 0;
    const variantAffinity = viewedVariants.get(offer.variantId) ?? 0;
    const titleTokens = tokenize(offer.productTitle);
    let searchAffinity = 0;
    for (const token of titleTokens) {
      searchAffinity += searchTokens.get(token) ?? 0;
    }
    const collectionAffinity = offer.productHandle
      ? 0
      : Array.from(viewedCollections.values()).reduce((sum, value) => sum + value, 0) * 0;
    const conversion = conversionByProduct.get(offer.productId) ?? 0;
    const dwell = timeOnPage.get(offer.productId) ?? 0;
    const score =
      productAffinity * PRODUCT_AFFINITY_WEIGHT +
      cartAffinity * CART_ADD_AFFINITY_WEIGHT +
      variantAffinity * VARIANT_AFFINITY_WEIGHT +
      searchAffinity * SEARCH_TITLE_WEIGHT +
      collectionAffinity * COLLECTION_AFFINITY_WEIGHT +
      dwell * TIME_ON_PAGE_WEIGHT +
      conversion * CONVERSION_WEIGHT;
    return { offer, index, score };
  });

  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map((row) => row.offer);
}

export async function rankAiRecommendPool(options: {
  shop: string;
  offerId: string;
  pool: EligibleOfferPayload[];
  identity: IdentityLookup;
  max?: number;
}): Promise<EligibleOfferPayload[]> {
  const { shop, offerId, pool, identity } = options;
  const max = options.max ?? MAX_UPSELL_PRODUCTS;
  if (pool.length === 0) return [];
  if (pool.length === 1) return pool.slice(0, max);

  const activity = await loadRecentActivity(shop, identity);
  const conversionByProduct = await getProductConversionPriors(
    shop,
    pool.map((item) => item.productId),
  );
  const ranked = scorePoolAgainstActivity(pool, activity, conversionByProduct);
  const withLlm =
    activity.length > 0
      ? await pickPoolWithOptionalLlm({ shop, offerId, identity, pool: ranked, activity })
      : ranked;
  return withLlm.slice(0, max);
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
