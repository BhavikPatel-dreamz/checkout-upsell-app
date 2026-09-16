import { ProductRelationKind, ProductRelationSource } from "@prisma/client";
import db from "../db.server";

const INSERT_CHUNK = 500;
const AFFINITY_PAGE = 1000;
const MAX_PER_KIND = 20;

export const RELATION_LIMITS = { maxPerKind: MAX_PER_KIND } as const;

function norm(value: string | null | undefined): string | null {
  const next = value?.trim().toLowerCase();
  return next ? next : null;
}

function tagOverlap(a: string[], b: string[]): string[] {
  const right = new Set(b.map((tag) => tag.trim().toLowerCase()).filter(Boolean));
  return [...new Set(a.map((tag) => tag.trim().toLowerCase()).filter(Boolean))].filter((tag) =>
    right.has(tag),
  );
}

export interface PairSignals {
  viewViewCount: number;
  atcAtcCount: number;
  buyBuyCount: number;
  categoryA: string | null;
  categoryB: string | null;
  brandA: string | null;
  brandB: string | null;
  tagsA: string[];
  tagsB: string[];
}

export interface ClassifiedRelation {
  kind: ProductRelationKind;
  score: number;
  evidence: {
    viewViewCount: number;
    atcAtcCount: number;
    buyBuyCount: number;
    sameCategory: boolean;
    sameBrand: boolean;
    tagOverlap: string[];
  };
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Standard heuristics: FBT from buy-buy, similar from co-view, complementary from other category + FBT/ATC. */
export function classifyProductPair(input: PairSignals): ClassifiedRelation[] {
  const catA = norm(input.categoryA);
  const catB = norm(input.categoryB);
  const brandA = norm(input.brandA);
  const brandB = norm(input.brandB);
  const sameCategory = Boolean(catA && catB && catA === catB);
  const sameBrand = Boolean(brandA && brandB && brandA === brandB);
  const overlap = tagOverlap(input.tagsA, input.tagsB);
  const evidence = {
    viewViewCount: input.viewViewCount,
    atcAtcCount: input.atcAtcCount,
    buyBuyCount: input.buyBuyCount,
    sameCategory,
    sameBrand,
    tagOverlap: overlap,
  };
  const out: ClassifiedRelation[] = [];

  if (input.buyBuyCount >= 1) {
    out.push({
      kind: ProductRelationKind.fbt,
      score: roundScore(input.buyBuyCount * 5 + input.atcAtcCount),
      evidence,
    });
  }

  if (input.viewViewCount >= 1) {
    const boost = 1 + (sameCategory ? 1 : 0) + (sameBrand ? 0.5 : 0) + Math.min(overlap.length, 3) * 0.25;
    out.push({
      kind: ProductRelationKind.similar,
      score: roundScore(input.viewViewCount * boost),
      evidence,
    });
  }

  const differentCategory = Boolean(catA && catB && catA !== catB);
  if (differentCategory && (input.buyBuyCount >= 1 || input.atcAtcCount >= 1)) {
    out.push({
      kind: ProductRelationKind.complementary,
      score: roundScore(input.buyBuyCount * 5 + input.atcAtcCount * 3),
      evidence,
    });
  }

  return out;
}

type Intel = {
  productId: string;
  category: string | null;
  brand: string | null;
  tags: string[];
};

async function loadIntel(shop: string): Promise<Map<string, Intel>> {
  const rows = await db.productIntelligence.findMany({
    where: { shop },
    select: { productId: true, category: true, brand: true, tags: true },
  });
  return new Map(
    rows.map((row) => [
      row.productId,
      { productId: row.productId, category: row.category, brand: row.brand, tags: row.tags },
    ]),
  );
}

function capByKind(
  rows: Array<{
    shop: string;
    productId: string;
    relatedProductId: string;
    kind: ProductRelationKind;
    source: ProductRelationSource;
    score: number;
    evidence: ClassifiedRelation["evidence"];
    computedAt: Date;
  }>,
) {
  const buckets = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.productId}|${row.kind}`;
    const list = buckets.get(key) ?? [];
    list.push(row);
    buckets.set(key, list);
  }
  const kept: typeof rows = [];
  for (const list of buckets.values()) {
    list.sort((a, b) => b.score - a.score);
    kept.push(...list.slice(0, MAX_PER_KIND));
  }
  return kept;
}

export interface RelationJobResult {
  shops: number;
  relations: number;
}

async function shopsForRelations(shopFilter?: string): Promise<string[]> {
  if (shopFilter) return [shopFilter];
  const [affinity, intel, shops] = await Promise.all([
    db.productProductAffinity.findMany({ distinct: ["shop"], select: { shop: true } }),
    db.productIntelligence.findMany({ distinct: ["shop"], select: { shop: true } }),
    db.shop.findMany({ select: { shop: true } }),
  ]);
  return Array.from(
    new Set([
      ...affinity.map((row) => row.shop),
      ...intel.map((row) => row.shop),
      ...shops.map((row) => row.shop),
    ]),
  );
}

export async function rebuildProductRelations(shopFilter?: string): Promise<RelationJobResult> {
  const shops = await shopsForRelations(shopFilter);
  let relations = 0;
  for (const shop of shops) {
    relations += await rebuildShopRelations(shop);
  }
  return { shops: shops.length, relations };
}

export async function rebuildShopRelations(shop: string): Promise<number> {
  const now = new Date();
  const intel = await loadIntel(shop);
  const classified: Array<{
    shop: string;
    productId: string;
    relatedProductId: string;
    kind: ProductRelationKind;
    source: ProductRelationSource;
    score: number;
    evidence: ClassifiedRelation["evidence"];
    computedAt: Date;
  }> = [];

  let cursor: string | undefined;
  for (;;) {
    const page = await db.productProductAffinity.findMany({
      where: { shop },
      orderBy: { id: "asc" },
      take: AFFINITY_PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (page.length === 0) break;
    cursor = page[page.length - 1].id;

    for (const row of page) {
      if (row.productId === row.relatedProductId) continue;
      const left = intel.get(row.productId);
      const right = intel.get(row.relatedProductId);
      const hits = classifyProductPair({
        viewViewCount: row.viewViewCount,
        atcAtcCount: row.atcAtcCount,
        buyBuyCount: row.buyBuyCount,
        categoryA: left?.category ?? null,
        categoryB: right?.category ?? null,
        brandA: left?.brand ?? null,
        brandB: right?.brand ?? null,
        tagsA: left?.tags ?? [],
        tagsB: right?.tags ?? [],
      });
      for (const hit of hits) {
        classified.push({
          shop,
          productId: row.productId,
          relatedProductId: row.relatedProductId,
          kind: hit.kind,
          source: ProductRelationSource.stat,
          score: hit.score,
          evidence: hit.evidence,
          computedAt: now,
        });
      }
    }
    if (page.length < AFFINITY_PAGE) break;
  }

  const rows = capByKind(classified);

  await db.productRelation.deleteMany({
    where: { shop, source: ProductRelationSource.stat },
  });

  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    await db.productRelation.createMany({ data: rows.slice(i, i + INSERT_CHUNK) });
  }

  return rows.length;
}
