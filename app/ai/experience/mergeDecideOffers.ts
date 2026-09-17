export interface DecideProductLike {
  productId: string;
  variantId?: string | null;
}

export interface DecideLike {
  show: boolean;
  products?: DecideProductLike[];
  copy?: { headline?: string; cta?: string } | null;
}

export function mergeEligibleWithDecide<T extends { productId: string }>(
  decision: DecideLike | null | undefined,
  eligible: T[],
): T[] {
  if (!decision?.show) return [];
  const wanted = new Set((decision.products ?? []).map((row) => row.productId).filter(Boolean));
  if (wanted.size === 0) return eligible;
  const matched = eligible.filter((row) => wanted.has(row.productId));
  return matched.length > 0 ? matched : eligible;
}
