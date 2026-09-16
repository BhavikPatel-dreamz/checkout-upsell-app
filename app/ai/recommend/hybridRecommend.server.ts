import { ConsentSubjectType, ProductRelationKind } from "@prisma/client";
import db from "../../db.server";
import { getMerchantRuleSet, toPipelineMerchantRules } from "../../models/merchantRuleSet.server";
import {
  runHybridPipeline,
  type HybridCandidate,
  type HybridPipelineResult,
  type MerchantRules,
  type RecommendStrategy,
} from "./pipeline";

function asStrategy(kind: ProductRelationKind): RecommendStrategy | null {
  if (kind === ProductRelationKind.fbt) return "fbt";
  if (kind === ProductRelationKind.similar) return "similar";
  if (kind === ProductRelationKind.complementary) return "complementary";
  return null;
}

export async function loadHybridCandidates(input: {
  shop: string;
  productIds: string[];
  customerId?: string | null;
}): Promise<HybridCandidate[]> {
  const anchors = [...new Set(input.productIds.map((id) => id.trim()).filter(Boolean))];
  if (anchors.length === 0) return [];

  if (typeof db.productRelation?.findMany !== "function") {
    throw new Error(
      "Prisma client is missing productRelation. Run `pnpm exec prisma generate` and restart the app.",
    );
  }

  const relations = await db.productRelation.findMany({
    where: { shop: input.shop, productId: { in: anchors } },
  });
  const relatedIds = [...new Set(relations.map((row) => row.relatedProductId))];
  if (relatedIds.length === 0) return [];

  const [intel, affinities, interests] = await Promise.all([
    db.productIntelligence.findMany({
      where: { shop: input.shop, productId: { in: relatedIds } },
    }),
    db.productProductAffinity.findMany({
      where: {
        shop: input.shop,
        productId: { in: anchors },
        relatedProductId: { in: relatedIds },
      },
    }),
    input.customerId
      ? db.customerProductAffinity.findMany({
          where: {
            shop: input.shop,
            subjectType: ConsentSubjectType.customer,
            subjectId: input.customerId,
            productId: { in: relatedIds },
          },
        })
      : Promise.resolve([]),
  ]);

  const intelById = new Map(intel.map((row) => [row.productId, row]));
  const affinityByPair = new Map(
    affinities.map((row) => [`${row.productId}|${row.relatedProductId}`, row.score]),
  );
  const interestByProduct = new Map(interests.map((row) => [row.productId, row.score]));

  const candidates: HybridCandidate[] = [];
  for (const relation of relations) {
    const strategy = asStrategy(relation.kind);
    if (!strategy) continue;
    const catalog = intelById.get(relation.relatedProductId);
    candidates.push({
      productId: relation.relatedProductId,
      strategy,
      relationScore: relation.score,
      availableForSale: catalog?.availableForSale ?? true,
      inventoryQuantity: catalog?.inventoryQuantity ?? null,
      price: catalog?.priceMin != null ? Number(catalog.priceMin) : null,
      affinity: affinityByPair.get(`${relation.productId}|${relation.relatedProductId}`) ?? 0,
      interest: interestByProduct.get(relation.relatedProductId) ?? 0,
      complementarity: strategy === "complementary" ? relation.score : 0,
    });
  }
  return candidates;
}

export async function runHybridRecommend(input: {
  shop: string;
  productIds: string[];
  cartProductIds?: string[];
  customerId?: string | null;
  merchant?: MerchantRules;
}): Promise<HybridPipelineResult> {
  const candidates = await loadHybridCandidates({
    shop: input.shop,
    productIds: input.productIds,
    customerId: input.customerId,
  });
  const merchant =
    input.merchant ?? toPipelineMerchantRules(await getMerchantRuleSet(input.shop));
  return runHybridPipeline({
    candidates,
    anchorProductIds: input.productIds,
    cartProductIds: input.cartProductIds ?? [],
    merchant,
  });
}
