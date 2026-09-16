import { describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ingestShopperEventBatch } from "../app/ai/events/ingest.server";

const db = new PrismaClient();
const SHOP = "ai-events-ingest-test.myshopify.com";

describe("AI events batch ingest", () => {
  it("drops the batch when analytics consent is false", async () => {
    const result = await ingestShopperEventBatch({
      shop: SHOP,
      consented: false,
      events: [
        {
          name: "recommendation_view",
          anonId: "anon-1",
          entities: { productId: "gid://shopify/Product/1" },
        },
      ],
    });
    expect(result.accepted).toBe(0);
    expect(result.skipped.consent).toBe(1);
  });

  it("persists recommendation and cart events and ignores other names", async () => {
    await db.shopperEvent.deleteMany({ where: { shop: SHOP } });
    const result = await ingestShopperEventBatch({
      shop: SHOP,
      consented: true,
      events: [
        {
          name: "recommendation_click",
          anonId: "anon-2",
          entities: { productId: "gid://shopify/Product/9", variantId: "gid://shopify/ProductVariant/9" },
          attribution: { recommendationId: "offer-1" },
        },
        {
          name: "add_to_cart",
          anonId: "anon-2",
          entities: { productId: "gid://shopify/Product/9" },
        },
        {
          name: "product_view",
          anonId: "anon-2",
        },
      ],
    });
    expect(result.accepted).toBe(2);
    expect(result.skipped.name).toBe(1);
    const rows = await db.shopperEvent.findMany({ where: { shop: SHOP }, orderBy: { name: "asc" } });
    expect(rows.map((row) => row.name)).toEqual(["add_to_cart", "recommendation_click"]);
  });
});
