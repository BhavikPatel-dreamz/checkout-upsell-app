import { PrismaClient, ProductRelationKind, ProductRelationSource } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { classifyProductPair, rebuildShopRelations } from "../app/jobs/relations.server";

const db = new PrismaClient();
const SHOP = "product-relation-test.myshopify.com";
const BOTTLE = "gid://shopify/Product/bottle";
const LID = "gid://shopify/Product/lid";
const OTHER_BOTTLE = "gid://shopify/Product/bottle-2";

describe("product relations", () => {
  it("classifies FBT, similar co-view, and complementary category+FBT", () => {
    const fbt = classifyProductPair({
      viewViewCount: 0,
      atcAtcCount: 1,
      buyBuyCount: 2,
      categoryA: "Drinkware",
      categoryB: "Accessories",
      brandA: "Acme",
      brandB: "Acme",
      tagsA: [],
      tagsB: [],
    });
    expect(fbt.map((row) => row.kind).sort()).toEqual([
      ProductRelationKind.complementary,
      ProductRelationKind.fbt,
    ]);

    const similar = classifyProductPair({
      viewViewCount: 4,
      atcAtcCount: 0,
      buyBuyCount: 0,
      categoryA: "Drinkware",
      categoryB: "Drinkware",
      brandA: "Acme",
      brandB: "Acme",
      tagsA: ["summer"],
      tagsB: ["summer"],
    });
    expect(similar).toHaveLength(1);
    expect(similar[0].kind).toBe(ProductRelationKind.similar);
    expect(similar[0].score).toBeGreaterThan(4);

    const sameCatBuy = classifyProductPair({
      viewViewCount: 0,
      atcAtcCount: 0,
      buyBuyCount: 1,
      categoryA: "Drinkware",
      categoryB: "Drinkware",
      brandA: null,
      brandB: null,
      tagsA: [],
      tagsB: [],
    });
    expect(sameCatBuy.map((row) => row.kind)).toEqual([ProductRelationKind.fbt]);
  });

  it("rebuilds stat relations from affinity and catalog intelligence", async () => {
    await db.productRelation.deleteMany({ where: { shop: SHOP } });
    await db.productProductAffinity.deleteMany({ where: { shop: SHOP } });
    await db.productIntelligence.deleteMany({ where: { shop: SHOP } });

    const now = new Date();
    await db.productIntelligence.createMany({
      data: [
        {
          shop: SHOP,
          productId: BOTTLE,
          title: "Bottle",
          category: "Drinkware",
          brand: "Acme",
          tags: ["outdoor"],
          syncedAt: now,
        },
        {
          shop: SHOP,
          productId: LID,
          title: "Lid",
          category: "Accessories",
          brand: "Acme",
          tags: ["outdoor"],
          syncedAt: now,
        },
        {
          shop: SHOP,
          productId: OTHER_BOTTLE,
          title: "Bottle 2",
          category: "Drinkware",
          brand: "Acme",
          tags: ["outdoor"],
          syncedAt: now,
        },
      ],
    });
    await db.productProductAffinity.createMany({
      data: [
        {
          shop: SHOP,
          productId: BOTTLE,
          relatedProductId: LID,
          viewViewCount: 2,
          atcAtcCount: 1,
          buyBuyCount: 1,
          lastOccurredAt: now,
          score: 10,
        },
        {
          shop: SHOP,
          productId: BOTTLE,
          relatedProductId: OTHER_BOTTLE,
          viewViewCount: 3,
          atcAtcCount: 0,
          buyBuyCount: 0,
          lastOccurredAt: now,
          score: 3,
        },
      ],
    });

    const count = await rebuildShopRelations(SHOP);
    expect(count).toBeGreaterThanOrEqual(3);

    const rows = await db.productRelation.findMany({
      where: { shop: SHOP, productId: BOTTLE },
    });
    const kindsForLid = rows
      .filter((row) => row.relatedProductId === LID)
      .map((row) => row.kind)
      .sort();
    expect(kindsForLid).toEqual([
      ProductRelationKind.complementary,
      ProductRelationKind.fbt,
      ProductRelationKind.similar,
    ]);
    expect(
      rows.some(
        (row) =>
          row.relatedProductId === OTHER_BOTTLE &&
          row.kind === ProductRelationKind.similar &&
          row.source === ProductRelationSource.stat,
      ),
    ).toBe(true);
    expect(rows.every((row) => row.relatedProductId !== BOTTLE)).toBe(true);
  }, 20_000);
});
