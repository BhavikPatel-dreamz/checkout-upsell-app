import { it } from "vitest";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

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

it("run sync + by-id queries against live API", async () => {
  const session = await db.session.findFirst({ where: { shop: "findash-shipping-12.myshopify.com" } });
  const token = (session as any).accessToken as string;
  const url = "https://findash-shipping-12.myshopify.com/admin/api/2026-07/graphql.json";

  const r1 = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query: SYNC_VARIANTS_QUERY, variables: { first: 25, after: null } }),
  });
  const b1 = await r1.json();
  console.log("SYNC_VARIANTS_ERRORS", b1.errors ? JSON.stringify(b1.errors) : "none");
  console.log("SYNC_VARIANTS_NODES", b1.data?.productVariants?.nodes?.length, "hasNext", b1.data?.productVariants?.pageInfo?.hasNextPage);

  const r2 = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query: SHOPIFY_PRODUCT_BY_ID_QUERY, variables: { id: "gid://shopify/Product/7965255041205" } }),
  });
  const b2 = await r2.json();
  console.log("BY_ID_ERRORS", b2.errors ? JSON.stringify(b2.errors) : "none");
  console.log("BY_ID_TITLE", b2.data?.product?.title, "variants", b2.data?.product?.variants?.nodes?.length);
  await db.$disconnect();
});
