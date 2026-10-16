import { createHmac, timingSafeEqual } from "node:crypto";

const SHOP_DOMAIN = /^[a-z0-9-]+\.myshopify\.com$/;

function shopDomain(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const shop = value.trim().toLowerCase();
  return SHOP_DOMAIN.test(shop) ? shop : null;
}

/** Shop-scoped token stored in the web pixel settings. The API secret stays on the server. */
export function pixelTokenForShop(shop: string, secret: string): string {
  return createHmac("sha256", secret).update(`pixel:${shop}`).digest("hex");
}

export function shopFromPixelCredential(
  shopValue: unknown,
  tokenValue: unknown,
  secret: string,
): string | null {
  const shop = shopDomain(shopValue);
  if (!shop || typeof tokenValue !== "string" || !/^[0-9a-f]{64}$/i.test(tokenValue)) return null;
  const expected = Buffer.from(pixelTokenForShop(shop, secret), "hex");
  const actual = Buffer.from(tokenValue, "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return shop;
}
