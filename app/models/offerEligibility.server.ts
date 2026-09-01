import { OfferPlacement, OfferType } from "@prisma/client";
import db from "../db.server";
import { getOfferTypeConfig } from "../config/offerTypes";
import type { IdentityLookup } from "./browseActivity.server";
import { MAX_UPSELL_PRODUCTS, type EligibleOfferPayload } from "./eligibleOffer";
import { rankAiRecommendPool } from "./offerRanker.server";

export { MAX_UPSELL_PRODUCTS, type EligibleOfferPayload } from "./eligibleOffer";

/**
 * Find eligible cart upsells for a shop given the cart product/variant ids.
 * Cross-sell returns every available pool SKU (later ranked across offers).
 * AI Recommend matches the same trigger products, then scores/caps the pool.
 */

function manualSelectionsFromRules(triggerRules: Record<string, unknown>): Array<{
  productId?: string;
  variantId?: string;
}> {
  const manualSelections = Array.isArray(triggerRules?.manualSelections)
    ? triggerRules.manualSelections
    : Array.isArray((triggerRules?.productSelection as { items?: unknown })?.items)
    ? (triggerRules.productSelection as { items: unknown[] }).items
    : [];
  return Array.isArray(manualSelections) ? (manualSelections as Array<{ productId?: string; variantId?: string }>) : [];
}

export async function findEligibleCrossSellOffers(options: {
  shop: string;
  placement: OfferPlacement;
  productIds?: string[];
  variantIds?: string[];
  identity?: IdentityLookup;
}) {
  const { shop, placement, productIds = [], variantIds = [] } = options;
  const identity = options.identity ?? {};

  const offers = await db.offer.findMany({
    where: {
      shop,
      isActive: true,
      type: { in: [OfferType.cross_sell, OfferType.ai_recommend] },
      placement,
    },
  });

  if (!offers || offers.length === 0) return [];

  let derivedProductIds: string[] = [];
  if (variantIds && variantIds.length > 0) {
    const rows = await db.productVariant.findMany({
      where: { shop, variantId: { in: variantIds } },
      select: { productId: true },
    });
    derivedProductIds = rows.map((r) => r.productId);
  }

  const cartProductIds = Array.from(new Set([...(productIds || []), ...derivedProductIds]));
  const cartVariantIdSet = new Set(variantIds);
  const cartProductIdSet = new Set(cartProductIds);

  const results: EligibleOfferPayload[] = [];
  const seenVariantIds = new Set<string>();

  for (const offer of offers) {
    const targets: string[] = Array.isArray(offer.targetProductIds) ? offer.targetProductIds : [];
    if (targets.length === 0) continue;
    if (!cartProductIds.some((id) => targets.includes(id))) continue;

    const triggerRules = (offer.triggerRules ?? {}) as Record<string, unknown>;
    const selections = manualSelectionsFromRules(triggerRules);
    if (selections.length === 0) continue;

    const pool: EligibleOfferPayload[] = [];

    for (const sel of selections) {
      if (!sel || typeof sel.variantId !== "string") continue;
      if (cartVariantIdSet.has(sel.variantId)) continue;
      if (seenVariantIds.has(sel.variantId)) continue;

      const pv = await db.productVariant.findFirst({
        where: { shop, variantId: sel.variantId, availableForSale: true },
      });
      if (!pv) continue;
      if (cartProductIdSet.has(pv.productId)) continue;

      pool.push({
        offerId: offer.id,
        offerName: offer.name,
        productId: pv.productId,
        variantId: pv.variantId,
        productHandle: pv.productHandle ?? null,
        productTitle: pv.productTitle,
        variantTitle: pv.variantTitle ?? null,
        imageUrl: pv.imageUrl ?? null,
        price: pv.price ? pv.price.toString() : null,
        promotionalTitle:
          typeof triggerRules.promotionalTitle === "string" ? triggerRules.promotionalTitle : null,
        offerType: offer.type,
        discountValue: typeof triggerRules.discountValue === "number" ? triggerRules.discountValue : null,
      });
    }

    const capped =
      offer.type === OfferType.ai_recommend || getOfferTypeConfig(offer.type).poolOnly
        ? await rankAiRecommendPool({
            shop,
            offerId: offer.id,
            pool,
            identity,
            max: MAX_UPSELL_PRODUCTS,
          })
        : pool;

    for (const item of capped) {
      if (seenVariantIds.has(item.variantId)) continue;
      seenVariantIds.add(item.variantId);
      results.push(item);
    }
  }

  return results;
}
