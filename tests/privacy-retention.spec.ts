import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { purgeExpiredEvents } from "../app/jobs/retention.server";
import { upsertShopPrivacySettings } from "../app/models/shopPrivacy.server";

const db = new PrismaClient();
const SHOP = "privacy-retention-test.myshopify.com";

describe("shop privacy retention", () => {
  it("deletes shopper and browse events older than the shop retention window", async () => {
    await db.shopperEvent.deleteMany({ where: { shop: SHOP } });
    await db.browseActivity.deleteMany({ where: { shop: SHOP } });
    await upsertShopPrivacySettings(SHOP, {
      trackingEnabled: true,
      privacyRetentionDays: 30,
    });

    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    const recent = new Date();
    await db.shopperEvent.create({
      data: {
        shop: SHOP,
        eventId: "old-evt",
        name: "purchase",
        occurredAt: old,
        anonId: "anon-old",
      },
    });
    await db.shopperEvent.create({
      data: {
        shop: SHOP,
        eventId: "new-evt",
        name: "purchase",
        occurredAt: recent,
        anonId: "anon-new",
      },
    });
    await db.browseActivity.create({
      data: {
        shop: SHOP,
        eventType: "product_viewed",
        clientId: "anon-old",
        occurredAt: old,
      },
    });

    const result = await purgeExpiredEvents(SHOP);
    expect(result.shopperEvents).toBe(1);
    expect(result.browseActivities).toBe(1);
    const remaining = await db.shopperEvent.findMany({ where: { shop: SHOP } });
    expect(remaining.map((row) => row.eventId)).toEqual(["new-evt"]);
  }, 20_000);
});
