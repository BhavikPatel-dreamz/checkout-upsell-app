/**
 * Sticky holdout without an assignment table (AI-3.1).
 * AI-5.1 will make rate merchant-configurable; default is 10%.
 */
export const DEFAULT_HOLDOUT_RATE = 0.1;

export function holdoutRateFromEnv(raw = process.env.AI_DECIDE_HOLDOUT_RATE): number {
  if (raw == null || raw === "") return DEFAULT_HOLDOUT_RATE;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_HOLDOUT_RATE;
  return Math.min(1, Math.max(0, parsed));
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Same shop + identity always gets the same bucket. */
export function assignHoldout(
  shop: string,
  identity: string,
  rate = holdoutRateFromEnv(),
): boolean {
  if (rate <= 0) return false;
  if (rate >= 1) return true;
  const bucket = fnv1a(`${shop.trim().toLowerCase()}\0${identity.trim()}`) / 0xffffffff;
  return bucket < rate;
}
