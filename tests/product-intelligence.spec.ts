import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  attributesFromOptions,
  buildProductIntelligenceRow,
  deleteOrphanProductIntelligence,
  seasonFromTags,
  upsertProductIntelligence,
} from "../app/models/productIntelligence.server";

const db = new PrismaClient();
const SHOP = "product-intelligence-test.myshopify.com";

describe("product intelligence", () => {
  it("maps season tags and option attributes", () => {
    expect(seasonFromTags(["Summer 2026", "cotton"])).toBe("summer");
    expect(seasonFromTags(["autumn"])).toBe("fall");
    expect(seasonFromTags(["basic"])).toBeNull();
    expect(
      attributesFromOptions([
        { price: "10", compareAtPrice: null, inventoryQuantity: 1, availableForSale: true, selectedOptions: [{ name: "Size", value: "M" }] },
        { price: "12", compareAtPrice: "15", inventoryQuantity: 2, availableForSale: false, selectedOptions: [{ name: "Size", value: "L" }] },
      ]),
    ).toEqual({ Size: ["L", "M"] });
  });

  it("upserts catalog features and drops orphans when variants are gone", async () => {
    await db.productIntelligence.deleteMany({ where: { shop: SHOP } });
    await db.productVariant.deleteMany({ where: { shop: SHOP } });

    const product = {
      id: "gid://shopify/Product/10",
      title: "Trail Bottle",
      handle: "trail-bottle",
      status: "ACTIVE",
      vendor: "Acme",
      productType: "Drinkware",
      publishedAt: "2026-06-01T00:00:00Z",
      tags: ["summer", "outdoor"],
      collections: { nodes: [{ title: "Camping" }] },
    };
    const variants = [
      {
        price: "19.00",
        compareAtPrice: "24.00",
        inventoryQuantity: 3,
        availableForSale: true,
        selectedOptions: [{ name: "Color", value: "Blue" }],
      },
      {
        price: "21.00",
        compareAtPrice: null,
        inventoryQuantity: 1,
        availableForSale: true,
        selectedOptions: [{ name: "Color", value: "Red" }],
      },
    ];

    const built = buildProductIntelligenceRow(SHOP, product, variants, new Date());
    expect(built.brand).toBe("Acme");
    expect(built.category).toBe("Drinkware");
    expect(built.season).toBe("summer");
    expect(built.inventoryQuantity).toBe(4);
    expect(Number(built.priceMin)).toBe(19);
    expect(Number(built.priceMax)).toBe(21);

    await upsertProductIntelligence(SHOP, product, variants, new Date());
    await db.productVariant.create({
      data: {
        shop: SHOP,
        variantId: "gid://shopify/ProductVariant/1",
        productId: product.id,
        productTitle: product.title,
      },
    });
    await db.productIntelligence.create({
      data: {
        shop: SHOP,
        productId: "gid://shopify/Product/gone",
        title: "Removed",
        syncedAt: new Date(),
      },
    });

    const removed = await deleteOrphanProductIntelligence(SHOP);
    expect(removed).toBe(1);
    expect(await db.productIntelligence.count({ where: { shop: SHOP } })).toBe(1);
    const row = await db.productIntelligence.findFirst({ where: { shop: SHOP } });
    expect(row?.collections).toEqual(["Camping"]);
    expect(row?.tags).toEqual(["summer", "outdoor"]);
  }, 20_000);
});
