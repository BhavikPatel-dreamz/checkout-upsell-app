import db from "../db.server";
import { getShopPrivacySettings } from "../models/shopPrivacy.server";

export interface RetentionPurgeResult {
  shops: number;
  shopperEvents: number;
  browseActivities: number;
}

async function shopsToPurge(): Promise<string[]> {
  const fromShop = await db.shop.findMany({ select: { shop: true } });
  const extraEvents = await db.shopperEvent.findMany({
    distinct: ["shop"],
    select: { shop: true },
  });
  const extraBrowse = await db.browseActivity.findMany({
    distinct: ["shop"],
    select: { shop: true },
  });
  return Array.from(
    new Set([
      ...fromShop.map((row) => row.shop),
      ...extraEvents.map((row) => row.shop),
      ...extraBrowse.map((row) => row.shop),
    ]),
  );
}

export async function purgeExpiredEvents(shopFilter?: string): Promise<RetentionPurgeResult> {
  const shops = shopFilter ? [shopFilter] : await shopsToPurge();
  let shopperEvents = 0;
  let browseActivities = 0;

  for (const shop of shops) {
    const settings = await getShopPrivacySettings(shop);
    const cutoff = new Date(Date.now() - settings.privacyRetentionDays * 24 * 60 * 60 * 1000);
    const [shopper, browse] = await Promise.all([
      db.shopperEvent.deleteMany({ where: { shop, occurredAt: { lt: cutoff } } }),
      db.browseActivity.deleteMany({ where: { shop, occurredAt: { lt: cutoff } } }),
    ]);
    shopperEvents += shopper.count;
    browseActivities += browse.count;
  }

  return { shops: shops.length, shopperEvents, browseActivities };
}
