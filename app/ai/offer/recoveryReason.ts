export const ABANDON_REASONS = ["forgot", "price", "accessory"] as const;

export type AbandonReason = (typeof ABANDON_REASONS)[number];

export const RECOVERY_TEMPLATES = {
  forgot: "recovery_reminder",
  price: "recovery_free_ship",
  accessory: "recovery_accessory",
} as const;

export const RECOVERY_COPY: Record<AbandonReason, { headline: string; cta: string }> = {
  forgot: { headline: "You left items in your cart", cta: "Return to cart" },
  price: { headline: "Free shipping on this order", cta: "Complete checkout" },
  accessory: { headline: "Complete the look", cta: "Add this too" },
};

/**
 * Why the shopper stalled: price friction vs forgot the cart vs missing accessory.
 * Heuristic only — not a bandit (Phase 5).
 */
export function inferAbandonReason(input: {
  priceSensitivity?: number | null;
  discountSensitivity?: number | null;
  strategies?: string[];
  cartValue?: number | null;
}): AbandonReason {
  const priceSensitivity = input.priceSensitivity ?? 0;
  const discountSensitivity = input.discountSensitivity ?? 0;
  const strategies = input.strategies ?? [];
  const accessoryStrategy = strategies.includes("complementary") || strategies.includes("fbt");

  if (priceSensitivity >= 0.35 || discountSensitivity >= 0.35) return "price";
  if (accessoryStrategy) return "accessory";
  if ((input.cartValue ?? 0) > 0 && (input.cartValue ?? 0) < 50 && discountSensitivity >= 0.2) return "price";
  return "forgot";
}

export function recoveryTemplateForReason(reason: AbandonReason): (typeof RECOVERY_TEMPLATES)[AbandonReason] {
  return RECOVERY_TEMPLATES[reason];
}
