import { OfferPlacement, OfferType } from "@prisma/client";
import db from "../db.server";

export interface EligibleOfferPayload {
  offerId: string;
  offerName: string;
  productId: string;
  variantId: string;
  productTitle: string;
  variantTitle: string | null;
  imageUrl: string | null;
  price: string | null;
  promotionalTitle?: string | null;
  offerType: OfferType;
  discountValue?: number | null;
}

/**
 * Find eligible cross-sell offers for a shop given the cart product/variant ids
 * Only supports manual product selections (triggerRules.manualSelections).
 * Scopes all queries by `shop`.
 */
const MAX_UPSELL_PRODUCTS = 5;

export async function findEligibleCrossSellOffers(options: {
  shop: string;
  placement: OfferPlacement;
  productIds?: string[]; // product GIDs in cart
  variantIds?: string[]; // variant GIDs in cart
}) {
  const { shop, placement, productIds = [], variantIds = [] } = options;

  // Load active cross-sell offers for this shop + placement
  const offers = await db.offer.findMany({
    where: {
      shop,
      isActive: true,
      type: OfferType.cross_sell,
      placement,
    },
  });

  if (!offers || offers.length === 0) return [];

  // If variantIds provided, map them to productIds owned by those variants
  let derivedProductIds: string[] = [];
  if (variantIds && variantIds.length > 0) {
    const rows = await db.productVariant.findMany({
      where: { shop, variantId: { in: variantIds } },
      select: { productId: true },
    });
    derivedProductIds = rows.map((r) => r.productId);
  }

  // Set of productIds present in cart (explicit + derived from variants)
  const cartProductIds = Array.from(new Set([...(productIds || []), ...derivedProductIds]));
  const cartVariantIdSet = new Set(variantIds);
  const cartProductIdSet = new Set(cartProductIds);

  const results: EligibleOfferPayload[] = [];
  const seenVariantIds = new Set<string>(); // dedup across offers

  for (const offer of offers) {
    if (results.length >= MAX_UPSELL_PRODUCTS) break;

    // Trigger products: the cart must contain at least one of them for the
    // offer to fire. A manually configured cross-sell always declares its
    // trigger product(s) — empty targetProductIds never matches all carts.
    const targets: string[] = Array.isArray(offer.targetProductIds) ? offer.targetProductIds : [];
    if (targets.length === 0) continue;
    if (!cartProductIds.some((id) => targets.includes(id))) continue;

    // Inspect triggerRules and only support manual selections for now
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const triggerRules = (offer.triggerRules ?? {}) as Record<string, any>;

    // Support both shapes produced by buildOfferPayload:
    // - triggerRules.manualSelections = [{ productId, variantId }, ...]
    // - triggerRules.productSelection.items = [{ productId, variantId }, ...]
    const manualSelections = Array.isArray(triggerRules?.manualSelections)
      ? triggerRules.manualSelections
      : Array.isArray(triggerRules?.productSelection?.items)
      ? triggerRules.productSelection.items
      : [];

    if (!manualSelections || manualSelections.length === 0) continue;

    // For each selection, verify the variant exists in ProductVariant for this shop
    for (const sel of manualSelections) {
      if (results.length >= MAX_UPSELL_PRODUCTS) break;
      if (!sel || typeof sel.variantId !== "string") continue;

      // Skip if already in cart
      if (cartVariantIdSet.has(sel.variantId)) continue;

      // Skip if we've already added this variant (dedup across offers)
      if (seenVariantIds.has(sel.variantId)) continue;

      const pv = await db.productVariant.findFirst({
        where: { shop, variantId: sel.variantId },
      });
      if (!pv) continue; // variant doesn't exist in this shop's catalog

      // Skip if the upsell product is the same as a trigger product in the cart
      if (cartProductIdSet.has(pv.productId)) continue;

      seenVariantIds.add(sel.variantId);

      results.push({
        offerId: offer.id,
        offerName: offer.name,
        productId: pv.productId,
        variantId: pv.variantId,
        productTitle: pv.productTitle,
        variantTitle: pv.variantTitle ?? null,
        imageUrl: pv.imageUrl ?? null,
        price: pv.price ? pv.price.toString() : null,
        promotionalTitle: (triggerRules && typeof triggerRules.promotionalTitle === "string") ? triggerRules.promotionalTitle : null,
        offerType: offer.type,
        discountValue: typeof triggerRules?.discountValue === "number" ? triggerRules.discountValue : null,
      });
    }
  }

  return results;
}
