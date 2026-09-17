import { ProductRelationKind, ProductRelationSource } from "@prisma/client";
import db from "../db.server";
import {
  catalogEmbeddingText,
  cosineSimilarity,
  hashEmbedding,
  parseVectorLiteral,
} from "../ai/embeddings/hashEmbed";

const NEIGHBORS = 10;
const MIN_SIMILAR = 0.25;

export interface EmbeddingJobResult {
  shops: number;
  embedded: number;
  relations: number;
  pgvector: boolean;
}

/** Embeddings are stored as JSON arrays; pgvector is not required. */
export async function pgvectorAvailable(): Promise<boolean> {
  return true;
}

function asNumberVector(value: unknown): number[] | null {
  if (Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isFinite(item))) {
    return value;
  }
  if (typeof value === "string") return parseVectorLiteral(value);
  return null;
}

async function shopsForEmbeddings(shopFilter?: string): Promise<string[]> {
  if (shopFilter) return [shopFilter];
  const rows = await db.productIntelligence.findMany({ distinct: ["shop"], select: { shop: true } });
  return rows.map((row) => row.shop);
}

export async function writeProductEmbedding(input: {
  shop: string;
  productId: string;
  title: string;
  brand?: string | null;
  category?: string | null;
  tags?: string[];
  collections?: string[];
}): Promise<boolean> {
  const vector = hashEmbedding(
    catalogEmbeddingText({
      title: input.title,
      brand: input.brand,
      category: input.category,
      tags: input.tags,
      collections: input.collections,
    }),
  );
  await db.productIntelligence.updateMany({
    where: { shop: input.shop, productId: input.productId },
    data: { embedding: vector },
  });
  return true;
}

export async function embedShopCatalog(shop: string): Promise<number> {
  const rows = await db.productIntelligence.findMany({
    where: { shop },
    select: {
      productId: true,
      title: true,
      brand: true,
      category: true,
      tags: true,
      collections: true,
    },
  });
  let written = 0;
  for (const row of rows) {
    const ok = await writeProductEmbedding({ shop, ...row });
    if (ok) written += 1;
  }
  return written;
}

type EmbeddedRow = {
  productId: string;
  category: string | null;
  vector: number[];
};

async function loadEmbeddedRows(shop: string): Promise<EmbeddedRow[]> {
  const rows = await db.productIntelligence.findMany({
    where: { shop },
    select: { productId: true, category: true, embedding: true },
  });
  return rows
    .map((row) => ({
      productId: row.productId,
      category: row.category,
      vector: asNumberVector(row.embedding),
    }))
    .filter((row): row is EmbeddedRow => Array.isArray(row.vector) && row.vector.length > 0);
}

export async function rebuildEmbeddingRelations(shop: string): Promise<number> {
  const rows = await loadEmbeddedRows(shop);
  await db.productRelation.deleteMany({
    where: { shop, source: ProductRelationSource.embed },
  });
  if (rows.length < 2) return 0;

  const now = new Date();
  const inserts: Array<{
    shop: string;
    productId: string;
    relatedProductId: string;
    kind: ProductRelationKind;
    source: ProductRelationSource;
    score: number;
    computedAt: Date;
  }> = [];

  for (const left of rows) {
    const scored = rows
      .filter((right) => right.productId !== left.productId)
      .map((right) => ({
        right,
        sim: cosineSimilarity(left.vector, right.vector),
      }))
      .filter((row) => row.sim >= MIN_SIMILAR)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, NEIGHBORS);

    for (const { right, sim } of scored) {
      const sameCategory = Boolean(
        left.category?.trim() &&
          right.category?.trim() &&
          left.category.trim().toLowerCase() === right.category.trim().toLowerCase(),
      );
      inserts.push({
        shop,
        productId: left.productId,
        relatedProductId: right.productId,
        kind: sameCategory ? ProductRelationKind.similar : ProductRelationKind.complementary,
        source: ProductRelationSource.embed,
        score: Math.round(sim * 1000) / 1000,
        computedAt: now,
      });
    }
  }

  for (let i = 0; i < inserts.length; i += 500) {
    await db.productRelation.createMany({ data: inserts.slice(i, i + 500) });
  }
  return inserts.length;
}

export async function refreshCatalogEmbeddings(shopFilter?: string): Promise<EmbeddingJobResult> {
  const shops = await shopsForEmbeddings(shopFilter);
  let embedded = 0;
  let relations = 0;
  for (const shop of shops) {
    embedded += await embedShopCatalog(shop);
    relations += await rebuildEmbeddingRelations(shop);
  }
  return { shops: shops.length, embedded, relations, pgvector: true };
}
