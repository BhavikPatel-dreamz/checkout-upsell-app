import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { cosineSimilarity, hashEmbedding } from "../app/ai/embeddings/hashEmbed";
import { pgvectorAvailable, refreshCatalogEmbeddings } from "../app/jobs/embeddings.server";
import { upsertProductIntelligence } from "../app/models/productIntelligence.server";

const db = new PrismaClient();
const SHOP = "embedding-pgvector-test.myshopify.com";

describe("catalog embeddings", () => {
  it("hashes similar titles closer than unrelated titles", () => {
    const bottle = hashEmbedding("trail bottle drinkware outdoor acme");
    const bottle2 = hashEmbedding("trail water bottle drinkware outdoor");
    const shoe = hashEmbedding("running shoe footwear nike");
    expect(cosineSimilarity(bottle, bottle2)).toBeGreaterThan(cosineSimilarity(bottle, shoe));
  });

  it("writes pgvector embeddings and embed relations when the extension exists", async () => {
    const available = await pgvectorAvailable();
    if (!available) {
      expect(available).toBe(false);
      return;
    }

    await db.productRelation.deleteMany({ where: { shop: SHOP } });
    await db.productIntelligence.deleteMany({ where: { shop: SHOP } });
    const syncedAt = new Date();
    await upsertProductIntelligence(
      SHOP,
      {
        id: "gid://shopify/Product/bottle",
        title: "Trail Bottle",
        handle: "trail-bottle",
        status: "ACTIVE",
        vendor: "Acme",
        productType: "Drinkware",
        tags: ["outdoor"],
        collections: { nodes: [] },
      },
      [{ price: "10", compareAtPrice: null, inventoryQuantity: 2, availableForSale: true, selectedOptions: [] }],
      syncedAt,
    );
    await upsertProductIntelligence(
      SHOP,
      {
        id: "gid://shopify/Product/tumbler",
        title: "Trail Tumbler",
        handle: "trail-tumbler",
        status: "ACTIVE",
        vendor: "Acme",
        productType: "Drinkware",
        tags: ["outdoor"],
        collections: { nodes: [] },
      },
      [{ price: "12", compareAtPrice: null, inventoryQuantity: 2, availableForSale: true, selectedOptions: [] }],
      syncedAt,
    );
    await upsertProductIntelligence(
      SHOP,
      {
        id: "gid://shopify/Product/lid",
        title: "Bottle Lid",
        handle: "lid",
        status: "ACTIVE",
        vendor: "Acme",
        productType: "Accessories",
        tags: ["outdoor"],
        collections: { nodes: [] },
      },
      [{ price: "4", compareAtPrice: null, inventoryQuantity: 5, availableForSale: true, selectedOptions: [] }],
      syncedAt,
    );

    const result = await refreshCatalogEmbeddings(SHOP);
    expect(result.pgvector).toBe(true);
    expect(result.embedded).toBeGreaterThanOrEqual(3);
    expect(result.relations).toBeGreaterThan(0);
    const similar = await db.productRelation.findMany({
      where: { shop: SHOP, source: "embed", kind: "similar" },
    });
    expect(similar.some((row) => row.productId.includes("bottle") && row.relatedProductId.includes("tumbler"))).toBe(
      true,
    );
  }, 20_000);
});
