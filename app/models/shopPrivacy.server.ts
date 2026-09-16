import db from "../db.server";

export const RETENTION_DAY_OPTIONS = [30, 90, 365] as const;
export const DEFAULT_RETENTION_DAYS = 90;

export interface ShopPrivacySettings {
  shop: string;
  trackingEnabled: boolean;
  privacyRetentionDays: number;
}

export function normalizeRetentionDays(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if ((RETENTION_DAY_OPTIONS as readonly number[]).includes(parsed)) return parsed;
  return DEFAULT_RETENTION_DAYS;
}

export async function getShopPrivacySettings(shop: string): Promise<ShopPrivacySettings> {
  const row = await db.shop.findUnique({
    where: { shop },
    select: { shop: true, trackingEnabled: true, privacyRetentionDays: true },
  });
  return {
    shop,
    trackingEnabled: row?.trackingEnabled ?? true,
    privacyRetentionDays: normalizeRetentionDays(row?.privacyRetentionDays),
  };
}

export async function upsertShopPrivacySettings(
  shop: string,
  input: { trackingEnabled: boolean; privacyRetentionDays: number },
): Promise<ShopPrivacySettings> {
  const privacyRetentionDays = normalizeRetentionDays(input.privacyRetentionDays);
  const row = await db.shop.upsert({
    where: { shop },
    create: {
      shop,
      trackingEnabled: input.trackingEnabled,
      privacyRetentionDays,
    },
    update: {
      trackingEnabled: input.trackingEnabled,
      privacyRetentionDays,
    },
    select: { shop: true, trackingEnabled: true, privacyRetentionDays: true },
  });
  return {
    shop: row.shop,
    trackingEnabled: row.trackingEnabled,
    privacyRetentionDays: normalizeRetentionDays(row.privacyRetentionDays),
  };
}
