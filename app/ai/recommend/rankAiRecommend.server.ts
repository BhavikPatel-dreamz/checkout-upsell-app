import { OfferType } from "@prisma/client";
import db from "../../db.server";
import { loadRecentActivity, type IdentityLookup } from "../../models/browseActivity.server";
import { MAX_UPSELL_PRODUCTS, type EligibleOfferPayload } from "../../models/eligibleOffer";
import { getMerchantRuleSet, toPipelineMerchantRules } from "../../models/merchantRuleSet.server";
import { pickPoolWithOptionalLlm, splitLlmTopK } from "../../models/offerLlmPicker.server";
import { loadHybridCandidates, runHybridRecommend } from "./hybridRecommend.server";
import { runHybridPipeline, type HybridCandidate, type MerchantRules } from "./pipeline";

function catalogExpandEnabled(override?: boolean): boolean {
  if (override != null) return override;
  const flag = process.env.AI_CATALOG_EXPAND?.trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

function poolProductIds(pool: EligibleOfferPayload[]): string[] {
  return [...new Set(pool.map((item) => item.productId))];
}

/** Reorder merchant-pool SKUs to match hybrid ranked product ids; drop ids not in the rank list. */
export function orderPoolByRankedProducts(
  pool: EligibleOfferPayload[],
  rankedProductIds: string[],
): EligibleOfferPayload[] {
  const remaining = [...pool];
  const ordered: EligibleOfferPayload[] = [];
  const seen = new Set<string>();
  for (const productId of rankedProductIds) {
    const index = remaining.findIndex((item) => item.productId === productId);
    if (index < 0) continue;
    const item = remaining.splice(index, 1)[0];
    if (seen.has(item.variantId)) continue;
    seen.add(item.variantId);
    ordered.push(item);
  }
  return ordered;
}

async function candidatesForMerchantPool(input: {
  shop: string;
  pool: EligibleOfferPayload[];
  anchorProductIds: string[];
  customerId?: string | null;
}): Promise<HybridCandidate[]> {
  const fromGraph = await loadHybridCandidates({
    shop: input.shop,
    productIds: input.anchorProductIds,
    customerId: input.customerId,
  });
  const allowed = new Set(poolProductIds(input.pool));
  const inPool = fromGraph.filter((row) => allowed.has(row.productId));
  const seen = new Set(inPool.map((row) => row.productId));
  for (const item of input.pool) {
    if (seen.has(item.productId)) continue;
    seen.add(item.productId);
    inPool.push({
      productId: item.productId,
      strategy: "similar",
      relationScore: 0,
      availableForSale: true,
      inventoryQuantity: null,
      price: item.price != null && item.price !== "" ? Number(item.price) : null,
    });
  }
  return inPool;
}

async function payloadsForCatalogProducts(input: {
  shop: string;
  offer: EligibleOfferPayload;
  productIds: string[];
  skipProductIds: Set<string>;
  skipVariantIds: Set<string>;
}): Promise<EligibleOfferPayload[]> {
  const extras: EligibleOfferPayload[] = [];
  for (const productId of input.productIds) {
    if (input.skipProductIds.has(productId)) continue;
    const pv = await db.productVariant.findFirst({
      where: { shop: input.shop, productId, availableForSale: true },
      orderBy: { inventoryQuantity: "desc" },
    });
    if (!pv || input.skipVariantIds.has(pv.variantId)) continue;
    extras.push({
      offerId: input.offer.offerId,
      offerName: input.offer.offerName,
      productId: pv.productId,
      variantId: pv.variantId,
      productHandle: pv.productHandle ?? null,
      productTitle: pv.productTitle,
      variantTitle: pv.variantTitle ?? null,
      imageUrl: pv.imageUrl ?? null,
      price: pv.price ? pv.price.toString() : null,
      promotionalTitle: input.offer.promotionalTitle,
      offerType: OfferType.ai_recommend,
      discountValue: input.offer.discountValue,
    });
    input.skipProductIds.add(pv.productId);
    input.skipVariantIds.add(pv.variantId);
  }
  return extras;
}

export async function rankAiRecommendWithHybrid(options: {
  shop: string;
  offerId: string;
  pool: EligibleOfferPayload[];
  identity: IdentityLookup;
  max?: number;
  anchorProductIds?: string[];
  cartProductIds?: string[];
  catalogExpand?: boolean;
  merchant?: MerchantRules;
}): Promise<EligibleOfferPayload[]> {
  const { shop, offerId, pool, identity } = options;
  const max = options.max ?? MAX_UPSELL_PRODUCTS;
  if (pool.length === 0) return [];

  const activity = await loadRecentActivity(shop, identity);
  const viewInterest = new Map<string, number>();
  for (const row of activity) {
    if (!row.productId) continue;
    viewInterest.set(row.productId, (viewInterest.get(row.productId) ?? 0) + 1);
  }

  const stored = options.merchant ?? toPipelineMerchantRules(await getMerchantRuleSet(shop));
  const merchant: MerchantRules = {
    ...stored,
    includeProductIds: poolProductIds(pool),
    maxN: Math.min(max, stored.maxN ?? max),
  };

  const anchors = options.anchorProductIds?.length ? options.anchorProductIds : options.cartProductIds ?? [];
  const candidates = (await candidatesForMerchantPool({
    shop,
    pool,
    anchorProductIds: anchors.length ? anchors : poolProductIds(pool),
    customerId: identity.customerId,
  })).map((row) => ({
    ...row,
    interest: (row.interest ?? 0) + (viewInterest.get(row.productId) ?? 0),
  }));
  const hybrid = runHybridPipeline({
    candidates,
    anchorProductIds: anchors,
    cartProductIds: options.cartProductIds ?? [],
    merchant,
  });
  const poolIndex = new Map(pool.map((item, index) => [item.productId, index]));
  const rankedIds = [...hybrid.ranked]
    .sort((a, b) => {
      const byScore = b.score.total - a.score.total;
      if (byScore !== 0) return byScore;
      return (poolIndex.get(a.productId) ?? 0) - (poolIndex.get(b.productId) ?? 0);
    })
    .map((row) => row.productId);
  let ranked = orderPoolByRankedProducts(pool, rankedIds);

  if (ranked.length > 1 && activity.length > 0) {
    const { head, tail } = splitLlmTopK(ranked);
    const reorderedHead = await pickPoolWithOptionalLlm({
      shop,
      offerId,
      identity,
      pool: head,
      activity,
    });
    ranked = [...reorderedHead, ...tail];
  }

  ranked = ranked.slice(0, max);

  if (catalogExpandEnabled(options.catalogExpand) && ranked.length < max && pool[0]) {
    const expanded = await runHybridRecommend({
      shop,
      productIds: anchors.length ? anchors : poolProductIds(pool),
      cartProductIds: options.cartProductIds ?? [],
      customerId: identity.customerId,
    });
    const extras = await payloadsForCatalogProducts({
      shop,
      offer: pool[0],
      productIds: expanded.ranked.map((row) => row.productId),
      skipProductIds: new Set([
        ...(options.cartProductIds ?? []),
        ...ranked.map((item) => item.productId),
      ]),
      skipVariantIds: new Set(ranked.map((item) => item.variantId)),
    });
    ranked = [...ranked, ...extras].slice(0, max);
  }

  return ranked;
}
