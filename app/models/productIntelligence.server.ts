import { Prisma } from "@prisma/client";
import db from "../db.server";

const SEASON_TAGS = ["spring", "summer", "fall", "autumn", "winter", "holiday"] as const;

export interface CatalogProductFields {
  id: string;
  title: string;
  handle: string | null;
  status: string | null;
  vendor?: string | null;
  productType?: string | null;
  publishedAt?: string | null;
  tags?: string[] | null;
  collections?: { nodes: { title: string }[] } | null;
}

export interface CatalogVariantFields {
  price: string | null;
  compareAtPrice: string | null;
  inventoryQuantity: number | null;
  availableForSale: boolean | null;
  selectedOptions: { name: string; value: string }[] | null;
}

export function seasonFromTags(tags: string[]): string | null {
  for (const tag of tags) {
    const token = tag.trim().toLowerCase();
    const hit = SEASON_TAGS.find((season) => token === season || token.includes(season));
    if (hit) return hit === "autumn" ? "fall" : hit;
  }
  return null;
}

export function attributesFromOptions(
  variants: CatalogVariantFields[],
): Record<string, string[]> {
  const map = new Map<string, Set<string>>();
  for (const variant of variants) {
    for (const option of variant.selectedOptions ?? []) {
      const name = option.name?.trim();
      const value = option.value?.trim();
      if (!name || !value) continue;
      let set = map.get(name);
      if (!set) {
        set = new Set();
        map.set(name, set);
      }
      set.add(value);
    }
  }
  return Object.fromEntries(
    [...map.entries()].map(([name, values]) => [name, [...values].sort()]),
  );
}

function moneyMinMax(values: Array<string | null>): {
  min: Prisma.Decimal | null;
  max: Prisma.Decimal | null;
} {
  const parsed = values
    .map((value) => {
      if (value == null || value === "") return null;
      try {
        return new Prisma.Decimal(value);
      } catch {
        return null;
      }
    })
    .filter((value): value is Prisma.Decimal => value != null);
  if (parsed.length === 0) return { min: null, max: null };
  return parsed.reduce(
    (acc, value) => ({
      min: acc.min == null || value.lessThan(acc.min) ? value : acc.min,
      max: acc.max == null || value.greaterThan(acc.max) ? value : acc.max,
    }),
    { min: parsed[0], max: parsed[0] },
  );
}

export function buildProductIntelligenceRow(
  shop: string,
  product: CatalogProductFields,
  variants: CatalogVariantFields[],
  syncedAt: Date,
): Prisma.ProductIntelligenceUncheckedCreateInput {
  const tags = (product.tags ?? []).map((tag) => tag.trim()).filter(Boolean);
  const collections = (product.collections?.nodes ?? [])
    .map((node) => node.title.trim())
    .filter(Boolean);
  const prices = moneyMinMax(variants.map((row) => row.price));
  const compare = moneyMinMax(variants.map((row) => row.compareAtPrice));
  const inventory = variants.reduce((sum, row) => sum + (row.inventoryQuantity ?? 0), 0);
  const publishedAt = product.publishedAt ? new Date(product.publishedAt) : null;

  return {
    shop,
    productId: product.id,
    title: product.title,
    handle: product.handle,
    status: product.status,
    brand: product.vendor?.trim() || null,
    category: product.productType?.trim() || null,
    tags,
    collections,
    attributes: attributesFromOptions(variants) as unknown as Prisma.InputJsonValue,
    priceMin: prices.min,
    priceMax: prices.max,
    compareAtMax: compare.max,
    inventoryQuantity: variants.length ? inventory : null,
    availableForSale: variants.some((row) => row.availableForSale),
    season: seasonFromTags(tags),
    publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
    syncedAt,
    computedAt: syncedAt,
  };
}

export async function upsertProductIntelligence(
  shop: string,
  product: CatalogProductFields,
  variants: CatalogVariantFields[],
  syncedAt: Date,
): Promise<void> {
  const row = buildProductIntelligenceRow(shop, product, variants, syncedAt);
  await db.productIntelligence.upsert({
    where: { shop_productId: { shop, productId: product.id } },
    create: row,
    update: row,
  });
  const { writeProductEmbedding } = await import("../jobs/embeddings.server");
  await writeProductEmbedding({
    shop,
    productId: product.id,
    title: row.title,
    brand: row.brand,
    category: row.category,
    tags: row.tags,
    collections: row.collections,
  });
}

export async function upsertProductIntelligenceForChunk(
  shop: string,
  nodes: Array<{
    price: string | null;
    compareAtPrice: string | null;
    inventoryQuantity: number | null;
    availableForSale: boolean | null;
    selectedOptions: { name: string; value: string }[] | null;
    product: CatalogProductFields;
  }>,
  syncedAt: Date,
): Promise<number> {
  const grouped = new Map<string, typeof nodes>();
  for (const node of nodes) {
    const list = grouped.get(node.product.id) ?? [];
    list.push(node);
    grouped.set(node.product.id, list);
  }
  for (const group of grouped.values()) {
    await upsertProductIntelligence(shop, group[0].product, group, syncedAt);
  }
  return grouped.size;
}

export async function deleteOrphanProductIntelligence(shop: string): Promise<number> {
  const remaining = await db.productVariant.findMany({
    where: { shop },
    distinct: ["productId"],
    select: { productId: true },
  });
  const keep = remaining.map((row) => row.productId);
  const deleted = await db.productIntelligence.deleteMany({
    where: keep.length ? { shop, productId: { notIn: keep } } : { shop },
  });
  return deleted.count;
}
