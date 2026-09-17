import type { OptimizationGoal } from "../learn/goal";
import { pickAbVariantId } from "./assign";

export interface BanditArm {
  variantId: string;
  trials: number;
  successes: number;
  rewardSum: number;
}

export interface PickBanditInput {
  holdout: boolean;
  variantIds: string[];
  arms?: BanditArm[];
  goal?: OptimizationGoal;
  random?: () => number;
  existingVariantId?: string | null;
  shop?: string;
  experimentId?: string;
  identity?: string;
}

function gaussian(rng: () => number): number {
  const u = Math.max(rng(), 1e-12);
  const v = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Marsaglia–Tsang gamma sample (shape > 0, scale 1). */
export function sampleGamma(shape: number, rng: () => number): number {
  if (!(shape > 0) || !Number.isFinite(shape)) return 0;
  if (shape < 1) {
    const u = Math.max(rng(), 1e-12);
    return sampleGamma(shape + 1, rng) * u ** (1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x = gaussian(rng);
    let v = 1 + c * x;
    while (v <= 0) {
      x = gaussian(rng);
      v = 1 + c * x;
    }
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export function sampleBeta(a: number, b: number, rng: () => number): number {
  const g1 = sampleGamma(Math.max(a, 1e-6), rng);
  const g2 = sampleGamma(Math.max(b, 1e-6), rng);
  const sum = g1 + g2;
  if (!(sum > 0)) return 0.5;
  return g1 / sum;
}

/** Beta prior from treated-only arm stats. Holdout never contributes to these counts. */
export function banditBetaParams(
  arm: BanditArm,
  goal: OptimizationGoal = "revenue",
): { a: number; b: number } {
  const trials = Math.max(0, arm.trials);
  const successes = Math.min(Math.max(0, arm.successes), trials);
  if (goal === "conversion") {
    return { a: 1 + successes, b: 1 + (trials - successes) };
  }
  const unit = goal === "aov" ? 50 : 25;
  const scaled = Math.max(0, arm.rewardSum) / unit;
  return { a: 1 + scaled, b: 1 + Math.max(0, trials - scaled) };
}

/**
 * Thompson sampling among experience variants for **treated** shoppers only.
 * Holdout always returns null and is never an arm.
 */
export function pickBanditVariantId(input: PickBanditInput): string | null {
  if (input.holdout) return null;
  const variantIds = input.variantIds.filter(Boolean);
  if (variantIds.length === 0) return null;
  if (input.existingVariantId && variantIds.includes(input.existingVariantId)) {
    return input.existingVariantId;
  }
  if (variantIds.length === 1) return variantIds[0];

  const byId = new Map((input.arms ?? []).map((arm) => [arm.variantId, arm]));
  const resolved: BanditArm[] = variantIds.map((variantId) => {
    const existing = byId.get(variantId);
    return {
      variantId,
      trials: existing?.trials ?? 0,
      successes: existing?.successes ?? 0,
      rewardSum: existing?.rewardSum ?? 0,
    };
  });

  const uninformed = resolved.every((arm) => arm.trials <= 0);
  if (uninformed && input.shop && input.experimentId && input.identity) {
    return pickAbVariantId(input.shop, input.experimentId, input.identity, variantIds);
  }

  const rng = input.random ?? Math.random;
  const goal = input.goal ?? "revenue";
  let bestId = variantIds[0];
  let bestDraw = -1;
  for (const arm of resolved) {
    const { a, b } = banditBetaParams(arm, goal);
    const draw = sampleBeta(a, b, rng);
    if (draw > bestDraw) {
      bestDraw = draw;
      bestId = arm.variantId;
    }
  }
  return bestId;
}
