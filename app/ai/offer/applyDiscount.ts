import { clampOfferPolicy, normalizeMaxDiscountPercent, type OfferPolicy } from "./policy";

/** Policies the Discount Function is allowed to apply. Others stay presentational. */
export const FUNCTION_ALLOWED_POLICIES = ["percent", "amount", "free_shipping"] as const;

export type FunctionAllowedPolicy = (typeof FUNCTION_ALLOWED_POLICIES)[number];

export type FunctionDiscountOp =
  | { kind: "none" }
  | { kind: "product_percent"; percent: number }
  | { kind: "product_amount"; amount: number }
  | { kind: "shipping_percent"; percent: number };

export function isFunctionAllowedPolicy(value: string): value is FunctionAllowedPolicy {
  return (FUNCTION_ALLOWED_POLICIES as readonly string[]).includes(value);
}

export function policyFromMerchantDeal(input: {
  dealType?: string | null;
  discountValue?: number | null;
  maxDiscountPercent: number;
}): OfferPolicy {
  const max = normalizeMaxDiscountPercent(input.maxDiscountPercent);
  if (input.dealType === "discount") {
    return clampOfferPolicy({ type: "percent", value: input.discountValue ?? 0 }, max);
  }
  if (input.dealType === "free") {
    return clampOfferPolicy({ type: "percent", value: max }, max);
  }
  return { type: "none", value: null };
}

export function functionDiscountForPolicy(input: {
  policyType: string;
  policyValue: number | null;
  maxDiscountPercent: number;
  linePrice?: number | null;
}): FunctionDiscountOp {
  const max = normalizeMaxDiscountPercent(input.maxDiscountPercent);
  if (!isFunctionAllowedPolicy(input.policyType)) return { kind: "none" };
  if (input.policyType === "percent") {
    const clamped = clampOfferPolicy({ type: "percent", value: input.policyValue }, max);
    if (clamped.type !== "percent" || !clamped.value) return { kind: "none" };
    return { kind: "product_percent", percent: clamped.value };
  }
  if (input.policyType === "amount") {
    const raw = input.policyValue ?? 0;
    if (raw <= 0 || max <= 0) return { kind: "none" };
    const price = input.linePrice ?? 0;
    const cap = price > 0 ? (price * max) / 100 : raw;
    const amount = Math.min(raw, cap);
    if (amount <= 0) return { kind: "none" };
    return { kind: "product_amount", amount };
  }
  if (max <= 0) return { kind: "none" };
  return { kind: "shipping_percent", percent: 100 };
}

export function upsellDiscountAttributes(
  policy: OfferPolicy,
  maxDiscountPercent: number,
): Record<string, string> {
  const max = String(normalizeMaxDiscountPercent(maxDiscountPercent));
  return {
    _upsell_policy: policy.type,
    _upsell_policy_value: policy.value == null ? "" : String(policy.value),
    _upsell_max_discount: max,
  };
}
