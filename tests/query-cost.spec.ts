import { it } from "vitest";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const QUERY = `query ProductCatalog($first: Int!, $after: String) {
  products(first: $first, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes { id title handle status description updatedAt
      featuredMedia { preview { image { url } } }
      variants(first: 250) { nodes { id title sku price compareAtPrice inventoryQuantity availableForSale
        selectedOptions { name value }
        media(first: 1) { nodes { preview { image { url } } } } } }
    }
  }
}`;

it("measure query cost", async () => {
  const session = await db.session.findFirst({ where: { shop: "findash-shipping-12.myshopify.com" } });
  const token = (session as any).accessToken as string;
  const url = "https://findash-shipping-12.myshopify.com/admin/api/2026-07/graphql.json";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query: QUERY, variables: { first: 25, after: null } }),
  });
  const body = await res.json();
  console.log("EXTENSIONS", JSON.stringify(body.extensions ?? null));
  console.log("THROTTLE_HEADER", res.headers.get("x-shopify-graphql-throttle-status"));
  const allHeaders: Record<string,string> = {};
  res.headers.forEach((v,k) => { if (/shopify/i.test(k)) allHeaders[k] = v; });
  console.log("SHOPIFY_HEADERS", JSON.stringify(allHeaders));
  await db.$disconnect();
});
