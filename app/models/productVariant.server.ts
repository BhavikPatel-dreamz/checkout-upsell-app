// Product catalog sync + reads. One row per Shopify product variant, shop-scoped.
// Keep this the only place that talks to Prisma for variants (see AGENTS.md).
// Standard core — generic, config-free; no client-specific logic.

import { Prisma } from "@prisma/client";
import db from "../db.server";

// Minimal structural type for the Admin GraphQL client returned by
// `authenticate.admin(request)` — avoids coupling to the SDK's exported name.
type AdminGraphqlClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

const PAGE_SIZE = 25; 

// Catalog reads don't chunk for timeout safety like sync does, so fetch as
// many products per round-trip as Shopify allows (250) to cut page-load
// latency down to a handful of API calls.
const CATALOG_PAGE_SIZE = 250; 

// Validated against Admin API 2026-07 (shopify-admin toolkit).
const SYNC_VARIANTS_QUERY = `#graphql
  query SyncProductVariants($first: Int!, $after: String) {
    productVariants(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        sku
        price
        compareAtPrice
        inventoryQuantity
        availableForSale
        selectedOptions { name value }
        media(first: 1) { nodes { preview { image { url } } } }
        product {
          id
          title
          handle
          status
          featuredMedia { preview { image { url } } }
        }
      }
    }
  }
`;

const SHOPIFY_PRODUCTS_QUERY = `#graphql
  query ProductCatalog($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        handle
        status
        description
        updatedAt
        featuredMedia { preview { image { url } } }
        variants(first: 250) {
          nodes {
            id
            title
            sku
            price
            compareAtPrice
            inventoryQuantity
            availableForSale
            selectedOptions { name value }
            media(first: 1) { nodes { preview { image { url } } } }
          }
        }
      }
    }
  }
`;

const SHOPIFY_PRODUCT_BY_ID_QUERY = `#graphql
  query ProductById($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      status
      description
      updatedAt
      vendor
      productType
      publishedAt
      tags
      collections(first: 5) {
        nodes { title }
      }
      onlineStoreUrl
      metafields(first: 20) {
        nodes { namespace key value }
      }
      featuredMedia { preview { image { url } } }
      variants(first: 250) {
        nodes {
          id
          title
          sku
          price
          compareAtPrice
          inventoryQuantity
          availableForSale
          selectedOptions { name value }
          media(first: 1) { nodes { preview { image { url } } } }
        }
      }
    }
  }
`;

interface ImagePreview { preview: { image: { url: string | null } | null } | null }

/** Shape of a variant node inside a product query (no nested product). */
interface CatalogVariantNode {
  id: string;
  title: string | null;
  sku: string | null;
  price: string | null;
  compareAtPrice: string | null;
  inventoryQuantity: number | null;
  availableForSale: boolean | null;
  selectedOptions: { name: string; value: string }[] | null;
  media: { nodes: ImagePreview[] } | null;
}

interface VariantNode {
  id: string;
  title: string | null;
  sku: string | null;
  price: string | null;
  compareAtPrice: string | null;
  inventoryQuantity: number | null;
  availableForSale: boolean;
  selectedOptions: { name: string; value: string }[];
  media: { nodes: ImagePreview[] };
  product: {
    id: string;
    title: string;
    handle: string | null;
    status: string | null;
    featuredMedia: ImagePreview | null;
  };
}

/** Shape of a product node as returned by the Shopify product catalog query. */
export interface CatalogProductNode {
  id: string;
  title: string;
  handle: string | null;
  status: string | null;
  description: string | null;
  updatedAt: string | null;
  vendor: string | null;
  productType: string | null;
  publishedAt: string | null;
  tags: string[];
  collections: { nodes: { title: string }[] };
  onlineStoreUrl: string | null;
  metafields: { nodes: { namespace: string; key: string; value: string }[] };
  featuredMedia: ImagePreview | null;
  variants: { nodes: CatalogVariantNode[] };
}

interface ProductVariantsPage {
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  nodes: VariantNode[];
}

function firstImageUrl(media: { nodes: ImagePreview[] }): string | null {
  return media?.nodes?.[0]?.preview?.image?.url ?? null;
}

function toRow(
  shop: string,
  node: VariantNode,
  syncedAt: Date,
): Prisma.ProductVariantUncheckedCreateInput {
  const variantImage = firstImageUrl(node.media);
  const productImage = node.product.featuredMedia?.preview?.image?.url ?? null;

  return {
    shop,
    variantId: node.id,
    variantTitle: node.title,
    sku: node.sku,
    price: node.price, // Money string, e.g. "19.99" — Prisma casts to Decimal
    compareAtPrice: node.compareAtPrice,
    inventoryQuantity: node.inventoryQuantity,
    availableForSale: node.availableForSale,
    selectedOptions: node.selectedOptions as unknown as Prisma.InputJsonValue,
    imageUrl: variantImage ?? productImage,
    productId: node.product.id,
    productTitle: node.product.title,
    productHandle: node.product.handle,
    productStatus: node.product.status,
    syncedAt,
  };
}

export interface SyncChunkResult {
  upserted: number; // variant rows created or updated in this page
  pages: 1; // one GraphQL page per call
  nextCursor: string | null; // cursor for the next page, or null when done
  done: boolean; // true when this was the last page
}

/**
 * Sync a single page (up to PAGE_SIZE variants) for one shop. Upserts one row
 * per variant — keyed on @@unique([shop, variantId]) so re-runs never
 * duplicate — each stamped with `syncedAt` (the owning run's start time) so a
 * later deleteStaleVariants() can remove rows this run never touched. Returns
 * the next cursor and whether the catalog is exhausted; the caller loops until
 * `done`. Idempotent per page.
 */
export async function syncProductsChunk(
  admin: AdminGraphqlClient,
  shop: string,
  { cursor, syncedAt }: { cursor: string | null; syncedAt: Date },
): Promise<SyncChunkResult> {
  console.info("[ProductSync] Started shop sync", { shop, cursor, pageSize: PAGE_SIZE });

  const response = await admin.graphql(SYNC_VARIANTS_QUERY, {
    variables: { first: PAGE_SIZE, after: cursor },
  });

  const body = (await response.json()) as {
    data?: { productVariants: ProductVariantsPage };
    errors?: unknown;
  };

  if (body.errors || !body.data) {
    console.error("[ProductSync] Failed", { shop, errors: body.errors ?? "no data returned" });
    throw new Error(
      `Shopify productVariants query failed: ${JSON.stringify(
        body.errors ?? "no data returned",
      )}`,
    );
  }

  const { nodes, pageInfo } = body.data.productVariants;
  console.info("[ProductSync] Fetched variants", {
    shop,
    fetched: nodes.length,
    hasNextPage: pageInfo.hasNextPage,
    nextCursor: pageInfo.endCursor,
  });

  // One transaction per page keeps the page atomic without holding a huge
  // transaction open across the whole (possibly large) catalog.
  await db.$transaction(
    nodes.map((node) => {
      const row = toRow(shop, node, syncedAt);
      return db.productVariant.upsert({
        where: { shop_variantId: { shop, variantId: node.id } },
        create: row,
        update: row,
      });
    }),
  );

  const nextCursor = pageInfo.hasNextPage ? pageInfo.endCursor : null;
  console.info("[ProductSync] Variants saved", {
    shop,
    saved: nodes.length,
    done: nextCursor === null,
    nextCursor,
  });

  return {
    upserted: nodes.length,
    pages: 1,
    nextCursor,
    done: nextCursor === null,
  };
}

/**
 * Delete variants whose rows weren't touched since `before` — i.e. variants no
 * longer in the store. Called once, on the final chunk of a run, with the run's
 * start time so only genuinely stale rows are removed. Returns the count deleted.
 */
export async function deleteStaleVariants(
  shop: string,
  before: Date,
): Promise<number> {
  const deleted = await db.productVariant.deleteMany({
    where: { shop, syncedAt: { lt: before } },
  });
  console.info("[ProductSync] Removed stale variants", { shop, removed: deleted.count, before });
  return deleted.count;
}

export async function getShopifyProductCatalog(admin: AdminGraphqlClient, shop: string) {
  const products: CatalogProductNode[] = [];
  let after: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response = await admin.graphql(SHOPIFY_PRODUCTS_QUERY, {
      variables: { first: CATALOG_PAGE_SIZE, after },
    });

    const body = (await response.json()) as {
      data?: {
        products?: {
          pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
          nodes?: CatalogProductNode[];
        };
      };
      errors?: unknown;
    };

    if (body.errors || !body.data?.products) {
      const message = JSON.stringify(body.errors ?? "no Shopify product catalog returned");
      console.error("[ProductSync] Failed to load product catalog", { shop, message });
      throw new Error(`Shopify product catalog query failed: ${message}`);
    }

    const nodes = body.data.products.nodes ?? [];
    products.push(...nodes);
    hasNextPage = Boolean(body.data.products.pageInfo?.hasNextPage);
    after = body.data.products.pageInfo?.endCursor ?? null;
  }

  return products;
}

export async function getShopifyProductById(admin: AdminGraphqlClient, productId: string) {
  const response = await admin.graphql(SHOPIFY_PRODUCT_BY_ID_QUERY, {
    variables: { id: productId },
  });

  const body = (await response.json()) as {
    data?: { product?: CatalogProductNode };
    errors?: unknown;
  };

  if (body.errors || !body.data) {
    const message = JSON.stringify(body.errors ?? "Product not found");
    console.error("[ProductSync] Failed to load product detail", { productId, message });
    return null;
  }

  return body.data.product ?? null;
}

export async function syncProductById(
  admin: AdminGraphqlClient,
  shop: string,
  productId: string,
  syncedAt = new Date(),
): Promise<{ upserted: number; removed: number }> {
  const product = await getShopifyProductById(admin, productId);
  if (!product) {
    throw new Error("Product not found in the connected Shopify store.");
  }

  const variantNodes = product.variants?.nodes ?? [];
  const observedIds = new Set<string>();

  await db.$transaction(
    variantNodes.map((node: CatalogVariantNode) => {
      const row = toRow(
        shop,
        {
          id: node.id,
          title: node.title,
          sku: node.sku,
          price: node.price,
          compareAtPrice: node.compareAtPrice,
          inventoryQuantity: node.inventoryQuantity,
          availableForSale: Boolean(node.availableForSale),
          selectedOptions: node.selectedOptions ?? [],
          media: node.media ?? { nodes: [] },
          product: {
            id: product.id,
            title: product.title,
            handle: product.handle,
            status: product.status,
            featuredMedia: product.featuredMedia ?? null,
          },
        },
        syncedAt,
      );
      observedIds.add(node.id);
      return db.productVariant.upsert({
        where: { shop_variantId: { shop, variantId: node.id } },
        create: row,
        update: row,
      });
    }),
  );

  let removed = 0;
  if (variantNodes.length === 0) {
    removed = (await db.productVariant.deleteMany({ where: { shop, productId } })).count;
  } else {
    removed = (await db.productVariant.deleteMany({
      where: { shop, productId, variantId: { notIn: Array.from(observedIds) } },
    })).count;
  }

  return { upserted: variantNodes.length, removed };
}

/** Current sync state for a shop — used by the dashboard status line. */
export async function getSyncStatus(shop: string) {
  const [variantCount, latest] = await Promise.all([
    db.productVariant.count({ where: { shop } }),
    db.productVariant.findFirst({
      where: { shop },
      orderBy: { syncedAt: "desc" },
      select: { syncedAt: true },
    }),
  ]);

  return { variantCount, lastSyncedAt: latest?.syncedAt ?? null };
}

/** List synced variants for a shop (newest products first). */
export function listProductVariants(shop: string, take = 50) {
  return db.productVariant.findMany({
    where: { shop },
    orderBy: [{ productTitle: "asc" }, { variantTitle: "asc" }],
    take,
  });
}

/** Find variants for the given product IDs (shop-scoped). Returns minimal fields used by the UI. */
export function findVariantsByProductIds(shop: string, productIds: string[]) {
  if (!Array.isArray(productIds) || productIds.length === 0) return Promise.resolve([]);
  return db.productVariant.findMany({
    where: { shop, productId: { in: productIds } },
    select: { productId: true, productTitle: true, variantId: true, variantTitle: true },
  });
}
