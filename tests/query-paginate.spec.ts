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

it("paginate entire catalog", async () => {
  const session = await db.session.findFirst({ where: { shop: "findash-shipping-12.myshopify.com" } });
  const token = (session as any).accessToken as string;
  const url = "https://findash-shipping-12.myshopify.com/admin/api/2026-07/graphql.json";
  let after: string | null = null;
  let pages = 0, products = 0, variants = 0, errors: unknown = null;
  let hasNextPage = true;
  const start = Date.now();
  while (hasNextPage) {
    pages++;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query: QUERY, variables: { first: 25, after } }),
    });
    const body = await res.json();
    if (body.errors) { errors = body.errors; break; }
    const nodes = body.data?.products?.nodes ?? [];
    products += nodes.length;
    variants += nodes.reduce((a: number, p: any) => a + (p.variants?.nodes?.length ?? 0), 0);
    hasNextPage = Boolean(body.data?.products?.pageInfo?.hasNextPage);
    after = body.data?.products?.pageInfo?.endCursor ?? null;
  }
  console.log("RESULT", JSON.stringify({ pages, products, variants, errors, elapsedMs: Date.now() - start }));
  await db.$disconnect();
});
