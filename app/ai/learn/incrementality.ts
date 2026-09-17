export const INCREMENTALITY_SURFACES = ["pdp", "cart", "popup", "thank_you", "recovery"] as const;

export type IncrementalitySurface = (typeof INCREMENTALITY_SURFACES)[number];

export const ALL_SURFACES = "_";
export const SHOP_WIDE_EXPERIMENT_ID = "_";

export const SURFACE_LABELS: Record<string, string> = {
  [ALL_SURFACES]: "All surfaces",
  pdp: "PDP",
  cart: "Cart",
  popup: "Popup",
  thank_you: "Thank-you",
  recovery: "Recovery",
};

/** Map decide channel / recovery template onto dashboard surfaces. */
export function incrementalitySurfaceFor(input: {
  channel?: string | null;
  templateId?: string | null;
  reason?: string | null;
}): IncrementalitySurface {
  const template = input.templateId ?? "";
  const reason = input.reason ?? "";
  if (
    template.startsWith("recovery_") ||
    template === "in_session_recovery" ||
    reason.startsWith("recovery_") ||
    reason.startsWith("exit_recovery")
  ) {
    return "recovery";
  }
  const channel = input.channel ?? "";
  if (channel === "cart" || channel === "checkout") return "cart";
  if (channel === "thank_you") return "thank_you";
  if (channel === "popup") return "popup";
  return "pdp";
}

export interface CohortTotals {
  users: number;
  orders: number;
  revenue: number;
}

export interface IncrementalityResult {
  treatedUsers: number;
  holdoutUsers: number;
  treatedOrders: number;
  holdoutOrders: number;
  treatedRevenue: number;
  holdoutRevenue: number;
  treatedConversion: number;
  holdoutConversion: number;
  treatedAov: number;
  holdoutAov: number;
  incrementalRevenue: number;
}

function ratio(num: number, den: number): number {
  if (!den || !Number.isFinite(num / den)) return 0;
  return num / den;
}

function money(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/**
 * North star: treated revenue-per-user minus holdout RPU, times treated users.
 * Same shop and window. Holdout must have users or incremental is 0.
 */
export function computeIncrementality(treated: CohortTotals, holdout: CohortTotals): IncrementalityResult {
  const treatedConversion = ratio(treated.orders, treated.users);
  const holdoutConversion = ratio(holdout.orders, holdout.users);
  const treatedAov = ratio(treated.revenue, treated.orders);
  const holdoutAov = ratio(holdout.revenue, holdout.orders);
  const treatedRpu = ratio(treated.revenue, treated.users);
  const holdoutRpu = ratio(holdout.revenue, holdout.users);
  const incrementalRevenue =
    holdout.users > 0 && treated.users > 0 ? (treatedRpu - holdoutRpu) * treated.users : 0;

  return {
    treatedUsers: treated.users,
    holdoutUsers: holdout.users,
    treatedOrders: treated.orders,
    holdoutOrders: holdout.orders,
    treatedRevenue: money(treated.revenue),
    holdoutRevenue: money(holdout.revenue),
    treatedConversion,
    holdoutConversion,
    treatedAov,
    holdoutAov,
    incrementalRevenue: money(incrementalRevenue),
  };
}
