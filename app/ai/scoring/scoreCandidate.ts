/**
 * Standard candidate scorer (AI-2.4).
 *
 * Weighted heuristic, not an LLM and not shop-learned yet.
 * Realtime wiring is AI-2.5 / AI-2.7; this module is pure math.
 *
 * score =
 *   w.affinity * squash(affinity)
 * + w.interest * squash(interest)
 * + w.pPurchase * p_purchase
 * + w.complementarity * squash(complementarity)
 * + w.historicalConversion * historical_conversion
 * + w.context * context
 * + w.priceFit * price_fit
 * + w.inventory * inventoryFactor(qty, available)
 * + w.businessValue * business_value
 * - w.repetitionPenalty * repetition
 * - w.inCartPenalty * (inCart ? 1 : 0)
 *
 * squash(x) = 1 - exp(-x / 5) maps raw counts/scores into ~[0, 1].
 * Probabilities and 0–1 fits are used as-is (clamped).
 */
export const SCORE_WEIGHTS = {
  affinity: 1.0,
  interest: 0.8,
  pPurchase: 1.2,
  complementarity: 0.9,
  historicalConversion: 0.7,
  context: 0.4,
  priceFit: 0.5,
  inventory: 0.6,
  businessValue: 0.3,
  repetitionPenalty: 0.8,
  inCartPenalty: 2.0,
} as const;

export type ScoreWeights = typeof SCORE_WEIGHTS;

const SQUASH_SCALE = 5;
const LOW_STOCK_QTY = 3;
const LOW_STOCK_FACTOR = 0.4;

export interface CandidateScoreInput {
  /** Product–product affinity score (or relation score used as affinity). */
  affinity?: number;
  /** Customer–product interest score. */
  interest?: number;
  /** P(purchase | context), 0–1. */
  pPurchase?: number;
  /** Complementary relation score. */
  complementarity?: number;
  /** Historical view→purchase (or rec→purchase) rate, 0–1. */
  historicalConversion?: number;
  /** Surface/strategy fit, 0–1. */
  context?: number;
  /** How well candidate price matches the shopper band, 0–1. */
  priceFit?: number;
  availableForSale?: boolean;
  inventoryQuantity?: number | null;
  /** Optional 0–1 proxy (normalized price/margin). Margin is not required. */
  businessValue?: number;
  /** Repeat-show / recently recommended, 0–1. */
  repetition?: number;
  inCart?: boolean;
}

export interface ScoreBreakdown {
  affinity: number;
  interest: number;
  pPurchase: number;
  complementarity: number;
  historicalConversion: number;
  context: number;
  priceFit: number;
  inventory: number;
  businessValue: number;
  repetitionPenalty: number;
  inCartPenalty: number;
}

export interface CandidateScore {
  total: number;
  parts: ScoreBreakdown;
  inventoryFactor: number;
  weights: ScoreWeights;
}

export function squash(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return 1 - Math.exp(-value / SQUASH_SCALE);
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Inventory factor: 0 if unavailable or qty ≤ 0; 0.4 if 1–2 units; 1 if 3+.
 * Missing quantity with availableForSale true is treated as in-stock (1).
 */
export function inventoryFactor(input: {
  availableForSale?: boolean;
  inventoryQuantity?: number | null;
}): number {
  if (input.availableForSale === false) return 0;
  if (input.inventoryQuantity == null) return 1;
  if (input.inventoryQuantity <= 0) return 0;
  if (input.inventoryQuantity < LOW_STOCK_QTY) return LOW_STOCK_FACTOR;
  return 1;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function scoreCandidate(
  input: CandidateScoreInput,
  weights: ScoreWeights = SCORE_WEIGHTS,
): CandidateScore {
  const stock = inventoryFactor({
    availableForSale: input.availableForSale,
    inventoryQuantity: input.inventoryQuantity,
  });
  const inCart = Boolean(input.inCart);

  const parts: ScoreBreakdown = {
    affinity: weights.affinity * squash(input.affinity ?? 0),
    interest: weights.interest * squash(input.interest ?? 0),
    pPurchase: weights.pPurchase * clamp01(input.pPurchase ?? 0),
    complementarity: weights.complementarity * squash(input.complementarity ?? 0),
    historicalConversion: weights.historicalConversion * clamp01(input.historicalConversion ?? 0),
    context: weights.context * clamp01(input.context ?? 0),
    priceFit: weights.priceFit * clamp01(input.priceFit ?? 0),
    inventory: weights.inventory * stock,
    businessValue: weights.businessValue * clamp01(input.businessValue ?? 0),
    repetitionPenalty: weights.repetitionPenalty * clamp01(input.repetition ?? 0),
    inCartPenalty: weights.inCartPenalty * (inCart ? 1 : 0),
  };

  const total = round4(
    parts.affinity +
      parts.interest +
      parts.pPurchase +
      parts.complementarity +
      parts.historicalConversion +
      parts.context +
      parts.priceFit +
      parts.inventory +
      parts.businessValue -
      parts.repetitionPenalty -
      parts.inCartPenalty,
  );

  return { total, parts, inventoryFactor: stock, weights };
}

export function compareCandidateScores(a: CandidateScore, b: CandidateScore): number {
  return b.total - a.total;
}
