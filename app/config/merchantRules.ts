import { MAX_UPSELL_PRODUCTS } from "../models/eligibleOffer";

export const MERCHANT_MAX_N_MIN = 1;
export const MERCHANT_MAX_N_MAX = 20;

export function parseProductIdList(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const tokens = raw
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const ids: string[] = [];
  for (const token of tokens) {
    if (token.startsWith("gid://shopify/Product/")) {
      ids.push(token);
      continue;
    }
    const numeric = token.match(/^(\d+)$/)?.[1];
    if (numeric) {
      ids.push(`gid://shopify/Product/${numeric}`);
      continue;
    }
    if (token.startsWith("gid://")) ids.push(token);
  }
  return [...new Set(ids)];
}

export function formatProductIdList(ids: string[]): string {
  return ids.join("\n");
}

export function normalizeMaxN(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return MAX_UPSELL_PRODUCTS;
  return Math.min(MERCHANT_MAX_N_MAX, Math.max(MERCHANT_MAX_N_MIN, Math.round(parsed)));
}

export function optionalNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}
