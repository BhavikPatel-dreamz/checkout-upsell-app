export const OFFER_POLICY_TYPES = [
  "none",
  "percent",
  "amount",
  "bundle",
  "free_shipping",
  "upgrade",
] as const;

export type OfferPolicyType = (typeof OFFER_POLICY_TYPES)[number];

export interface OfferPolicy {
  type: OfferPolicyType;
  value: number | null;
}

export const DEFAULT_MAX_DISCOUNT_PERCENT = 15;
export const MAX_DISCOUNT_PERCENT_CAP = 50;

export function normalizeMaxDiscountPercent(value: unknown): number {
  if (value == null || value === "") return DEFAULT_MAX_DISCOUNT_PERCENT;
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(MAX_DISCOUNT_PERCENT_CAP, parsed);
}

export function clampOfferPolicy(policy: OfferPolicy, maxDiscountPercent: number): OfferPolicy {
  const max = normalizeMaxDiscountPercent(maxDiscountPercent);
  if (policy.type === "none") return { type: "none", value: null };
  if (max <= 0 && (policy.type === "percent" || policy.type === "amount")) {
    return { type: "none", value: null };
  }
  if (policy.type === "percent") {
    const raw = policy.value ?? 0;
    const value = Math.min(Math.max(0, raw), max);
    if (value <= 0) return { type: "none", value: null };
    return { type: "percent", value };
  }
  return policy;
}

/**
 * Heuristic policy only — no bandit (Phase 5). Shopify Function apply is AI-4.2.
 */
export function selectOfferPolicy(input: {
  show: boolean;
  intentState: string;
  purchaseIntent: number;
  strategies?: string[];
  cartValue?: number;
  maxDiscountPercent: number;
}): OfferPolicy {
  if (!input.show) return { type: "none", value: null };
  const max = normalizeMaxDiscountPercent(input.maxDiscountPercent);
  const strategies = input.strategies ?? [];
  const cartValue = input.cartValue ?? 0;

  let chosen: OfferPolicy = { type: "none", value: null };
  if (input.intentState === "ABANDONING") {
    chosen = { type: "percent", value: Math.min(10, max) };
  } else if (strategies.includes("complementary") || strategies.includes("fbt")) {
    chosen = { type: "bundle", value: null };
  } else if (cartValue > 0 && cartValue < 50 && input.purchaseIntent >= 0.35) {
    chosen = { type: "free_shipping", value: null };
  } else if (input.intentState === "HIGH_INTENT" && strategies.includes("similar")) {
    chosen = { type: "upgrade", value: null };
  }

  return clampOfferPolicy(chosen, max);
}
