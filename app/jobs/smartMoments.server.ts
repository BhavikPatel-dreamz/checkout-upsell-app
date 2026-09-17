import { ProductRelationKind } from "@prisma/client";
import db from "../db.server";
import { detectSmartMomentCandidates, type AffinityPairInput } from "../ai/moments/detect";

function relationKind(
  kind: ProductRelationKind | undefined,
): AffinityPairInput["relationKind"] {
  if (kind === ProductRelationKind.fbt) return "fbt";
  if (kind === ProductRelationKind.similar) return "similar";
  if (kind === ProductRelationKind.complementary) return "complementary";
  return null;
}

export async function rebuildSmartMoments(shopFilter?: string): Promise<{
  shops: number;
  upserted: number;
}> {
  const shops = shopFilter
    ? [shopFilter]
    : [...new Set((await db.productProductAffinity.findMany({ distinct: ["shop"], select: { shop: true } })).map((row) => row.shop))];

  let upserted = 0;
  for (const shop of shops) {
    upserted += await rebuildShopSmartMoments(shop);
  }
  return { shops: shops.length, upserted };
}

export async function rebuildShopSmartMoments(shop: string): Promise<number> {
  const [affinities, relations] = await Promise.all([
    db.productProductAffinity.findMany({ where: { shop } }),
    db.productRelation.findMany({
      where: { shop },
      select: { productId: true, relatedProductId: true, kind: true },
    }),
  ]);

  const kindByPair = new Map<string, ProductRelationKind>();
  for (const row of relations) {
    const key = `${row.productId}|${row.relatedProductId}`;
    const prev = kindByPair.get(key);
    if (!prev || row.kind === ProductRelationKind.complementary) {
      kindByPair.set(key, row.kind);
    }
  }

  const pairs: AffinityPairInput[] = affinities.map((row) => ({
    productId: row.productId,
    relatedProductId: row.relatedProductId,
    buyBuyCount: row.buyBuyCount,
    viewViewCount: row.viewViewCount,
    atcAtcCount: row.atcAtcCount,
    score: row.score,
    relationKind: relationKind(kindByPair.get(`${row.productId}|${row.relatedProductId}`)),
  }));

  const detected = detectSmartMomentCandidates(pairs);
  let upserted = 0;

  for (const moment of detected) {
    const existing = await db.smartMoment.findUnique({
      where: {
        shop_kind_productId_relatedProductId: {
          shop,
          kind: moment.kind,
          productId: moment.productId,
          relatedProductId: moment.relatedProductId,
        },
      },
    });
    if (existing && existing.status !== "detected") continue;
    await db.smartMoment.upsert({
      where: {
        shop_kind_productId_relatedProductId: {
          shop,
          kind: moment.kind,
          productId: moment.productId,
          relatedProductId: moment.relatedProductId,
        },
      },
      create: {
        shop,
        kind: moment.kind,
        status: "detected",
        productId: moment.productId,
        relatedProductId: moment.relatedProductId,
        support: moment.support,
        lift: moment.lift,
        expectedImpact: moment.expectedImpact,
        explanation: moment.explanation,
      },
      update: {
        support: moment.support,
        lift: moment.lift,
        expectedImpact: moment.expectedImpact,
        explanation: moment.explanation,
      },
    });
    upserted += 1;
  }

  return upserted;
}
