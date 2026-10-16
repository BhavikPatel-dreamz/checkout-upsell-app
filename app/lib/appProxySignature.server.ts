import { createHmac, timingSafeEqual } from "node:crypto";

const SHOP_DOMAIN = /^[a-z0-9-]+\.myshopify\.com$/;
const MAX_SKEW_SEC = 90;

function decodeQueryComponent(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

function queryPairs(search: string): Map<string, string[]> {
  const params = new Map<string, string[]>();
  const raw = search.startsWith("?") ? search.slice(1) : search;
  if (!raw) return params;

  for (const part of raw.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const key = decodeQueryComponent(eq === -1 ? part : part.slice(0, eq));
    const value = decodeQueryComponent(eq === -1 ? "" : part.slice(eq + 1));
    const current = params.get(key);
    if (current) current.push(value);
    else params.set(key, [value]);
  }

  return params;
}

/**
 * Shopify's app-proxy signature is the HMAC of `key=value` pairs sorted as
 * whole strings and concatenated with no separator. Repeated keys stay in
 * arrival order and are joined with a comma.
 */
export function appProxySignatureMessage(search: string): string {
  const params = queryPairs(search);
  return [...params.entries()]
    .filter(([key]) => key !== "signature" && key !== "hmac")
    .map(([key, values]) => `${key}=${values.join(",")}`)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .join("");
}

function signaturesMatch(expectedHex: string, actualHex: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(actualHex) || !/^[0-9a-f]{64}$/i.test(expectedHex)) {
    return false;
  }
  const expected = Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(actualHex, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function appProxySignatureMatches(
  search: string,
  secret: string,
  nowSec = Math.trunc(Date.now() / 1000),
): boolean {
  if (!secret) return false;
  const params = queryPairs(search);
  const signature = params.get("signature")?.at(-1);
  const timestamp = Number(params.get("timestamp")?.at(-1));
  if (!signature || !Number.isFinite(timestamp)) return false;
  if (Math.abs(nowSec - timestamp) > MAX_SKEW_SEC) return false;

  const digest = createHmac("sha256", secret)
    .update(appProxySignatureMessage(search))
    .digest("hex");
  return signaturesMatch(digest, signature);
}

export function shopFromAppProxyQuery(
  search: string,
  secret: string,
  nowSec = Math.trunc(Date.now() / 1000),
): string | null {
  if (!appProxySignatureMatches(search, secret, nowSec)) return null;
  const shops = queryPairs(search).get("shop") ?? [];
  for (let index = shops.length - 1; index >= 0; index -= 1) {
    const shop = shops[index]?.trim().toLowerCase() ?? "";
    if (SHOP_DOMAIN.test(shop)) return shop;
  }
  return null;
}
