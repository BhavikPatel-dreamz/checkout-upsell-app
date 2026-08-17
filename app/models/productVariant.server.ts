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

const PAGE_SIZE = 250; // Shopify connection maximum — one chunk per client request

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

type ImagePreview = { preview: { image: { url: string | null } | null } | null };

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
  const response = await admin.graphql(SYNC_VARIANTS_QUERY, {
    variables: { first: PAGE_SIZE, after: cursor },
  });

  const body = (await response.json()) as {
    data?: { productVariants: ProductVariantsPage };
    errors?: unknown;
  };

  if (body.errors || !body.data) {
    throw new Error(
      `Shopify productVariants query failed: ${JSON.stringify(
        body.errors ?? "no data returned",
      )}`,
    );
  }

  const { nodes, pageInfo } = body.data.productVariants;

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
  return deleted.count;
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
