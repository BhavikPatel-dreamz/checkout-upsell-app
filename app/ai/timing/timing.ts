import type { DecideSurface } from "../decide/contract";

export const TIMING_MIN_DWELL_MS = 8_000;
export const TIMING_MIN_SCROLL = 0.35;
export const TIMING_MIN_CART_VALUE = 15;

/** Interruption cost by surface. Popup/sidebar cost more than in-flow cart/PDP. */
export const INTERRUPTION_COST: Record<DecideSurface, number> = {
  product_page: 0.18,
  cart: 0.12,
  thank_you: 0.1,
  checkout: 0.2,
  sidebar: 0.28,
  popup: 0.42,
};

export type TimingTrigger = "immediate" | "dwell" | "scroll" | "exit" | "cart_value" | "suppressed";

export interface TimingDecision {
  show: boolean;
  delayMs: number;
  trigger: TimingTrigger;
  expectedValue: number;
  interruptionCost: number;
  reason: string;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(1, value);
}

/**
 * Heuristic expected incremental value vs a 0–1 interruption cost.
 * Not a trained model — Standard default is hide unless EV clears the cost.
 */
export function expectedIncrementalValue(input: {
  maxScore: number;
  purchaseIntent: number;
  cartValue: number;
  exitIntent: boolean;
}): number {
  const score = clamp01(input.maxScore);
  const intent = clamp01(input.purchaseIntent);
  const cartLift = Math.min(Math.max(input.cartValue, 0) / 80, 0.35);
  const exitLift = input.exitIntent ? 0.08 : 0;
  return clamp01(score * (0.35 + 0.55 * intent) + cartLift * 0.4 + exitLift);
}

export function evaluateTiming(input: {
  surface: DecideSurface;
  dwellMs?: number | null;
  scrollDepth?: number | null;
  exitIntent?: boolean | null;
  cartValue?: number | null;
  purchaseIntent: number;
  maxScore: number;
  productCount: number;
}): TimingDecision {
  const interruptionCost = INTERRUPTION_COST[input.surface];
  const cartValue = input.cartValue ?? 0;
  const exitIntent = Boolean(input.exitIntent);
  const expectedValue = expectedIncrementalValue({
    maxScore: input.maxScore,
    purchaseIntent: input.purchaseIntent,
    cartValue,
    exitIntent,
  });

  if (input.productCount <= 0) {
    return {
      show: false,
      delayMs: 0,
      trigger: "suppressed",
      expectedValue,
      interruptionCost,
      reason: "no_products",
    };
  }

  if (expectedValue < interruptionCost) {
    return {
      show: false,
      delayMs: 0,
      trigger: "suppressed",
      expectedValue,
      interruptionCost,
      reason: "low_expected_value",
    };
  }

  const dwellMs = input.dwellMs ?? 0;
  const scrollDepth = input.scrollDepth ?? 0;
  const inFlow =
    input.surface === "cart" || input.surface === "checkout" || input.surface === "thank_you";

  if (exitIntent) {
    return {
      show: true,
      delayMs: 0,
      trigger: "exit",
      expectedValue,
      interruptionCost,
      reason: "exit_intent",
    };
  }
  if (inFlow) {
    return {
      show: true,
      delayMs: 0,
      trigger: cartValue > 0 ? "cart_value" : "immediate",
      expectedValue,
      interruptionCost,
      reason: "in_flow_surface",
    };
  }
  if (scrollDepth >= TIMING_MIN_SCROLL) {
    return {
      show: true,
      delayMs: 0,
      trigger: "scroll",
      expectedValue,
      interruptionCost,
      reason: "scroll_depth",
    };
  }
  if (dwellMs >= TIMING_MIN_DWELL_MS) {
    return {
      show: true,
      delayMs: 0,
      trigger: "dwell",
      expectedValue,
      interruptionCost,
      reason: "dwell",
    };
  }
  if (cartValue >= TIMING_MIN_CART_VALUE) {
    return {
      show: true,
      delayMs: 0,
      trigger: "cart_value",
      expectedValue,
      interruptionCost,
      reason: "cart_value",
    };
  }

  return {
    show: false,
    delayMs: Math.max(0, TIMING_MIN_DWELL_MS - dwellMs),
    trigger: "dwell",
    expectedValue,
    interruptionCost,
    reason: "wait_dwell",
  };
}
