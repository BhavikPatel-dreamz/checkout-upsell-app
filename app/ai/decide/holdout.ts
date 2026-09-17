/**
 * Always-on sticky holdout for decide (AI-5.1).
 * Merchants can change the rate; they cannot turn it off (floor 5%).
 */
export const DEFAULT_HOLDOUT_RATE = 0.1;
export const DEFAULT_HOLDOUT_PERCENT = 10;
export const MIN_HOLDOUT_PERCENT = 5;
export const MAX_HOLDOUT_PERCENT = 50;

export function normalizeHoldoutPercent(value: unknown): number {
  if (value == null || value === "") return DEFAULT_HOLDOUT_PERCENT;
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) return DEFAULT_HOLDOUT_PERCENT;
  return Math.min(MAX_HOLDOUT_PERCENT, Math.max(MIN_HOLDOUT_PERCENT, parsed));
}

export function holdoutRateFromPercent(percent: unknown): number {
  return normalizeHoldoutPercent(percent) / 100;
}

export function holdoutRateFromEnv(raw = process.env.AI_DECIDE_HOLDOUT_RATE): number {
  if (raw == null || raw === "") return DEFAULT_HOLDOUT_RATE;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_HOLDOUT_RATE;
  return holdoutRateFromPercent(parsed <= 1 ? parsed * 100 : parsed);
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
