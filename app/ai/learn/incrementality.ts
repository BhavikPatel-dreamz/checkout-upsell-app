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

function moneyFromUnknown(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/** Order total on shopper purchase / checkout_completed context. */
export function revenueFromShopperContext(context: unknown): number {
  if (!context || typeof context !== "object") return 0;
  const row = context as Record<string, unknown>;
  for (const key of ["cartValue", "totalPrice", "total_price", "orderValue", "current_total_price"]) {
    const n = moneyFromUnknown(row[key]);
    if (n > 0) return n;
  }
  return 0;
}

export function purchaseOrderKey(eventId: string): string {
  if (eventId.startsWith("checkout_completed:")) return eventId.slice("checkout_completed:".length);
  if (eventId.startsWith("purchase:")) {
    const rest = eventId.slice("purchase:".length);
    const lastColon = rest.lastIndexOf(":");
    return lastColon > 0 ? rest.slice(0, lastColon) : rest;
  }
  return eventId;
}

/**
 * One order per checkout / Shopify order id. Prefer checkout_completed totals over
 * attributed offer-line revenue so a purchased OfferEvent with null revenue still
 * counts the paid order amount.
 */
export function cohortOrdersAndRevenue(input: {
  shopper: Array<{ eventId: string; context: unknown }>;
  offers: Array<{
    orderId: string | null;
    revenue: unknown;
    customerId: string | null;
    guestKey: string | null;
  }>;
}): { orders: number; revenue: number } {
  const totals = new Map<string, { amount: number; fromCheckout: boolean }>();

  const bump = (key: string, amount: number, fromCheckout: boolean) => {
    const prev = totals.get(key) ?? { amount: 0, fromCheckout: false };
    if (fromCheckout) {
      totals.set(key, { amount: Math.max(prev.amount, amount), fromCheckout: true });
      return;
    }
    if (prev.fromCheckout && prev.amount > 0) return;
    if (prev.fromCheckout) {
      totals.set(key, { amount: Math.max(prev.amount, amount), fromCheckout: true });
      return;
    }
    totals.set(key, { amount: prev.amount + amount, fromCheckout: false });
  };

  for (const row of input.shopper) {
    const fromCheckout = row.eventId.startsWith("checkout_completed:");
    bump(purchaseOrderKey(row.eventId), revenueFromShopperContext(row.context), fromCheckout);
  }
  for (const row of input.offers) {
    const key = row.orderId || `offer:${row.customerId ?? row.guestKey ?? "unknown"}`;
    bump(key, moneyFromUnknown(row.revenue), false);
  }

  let revenue = 0;
  for (const row of totals.values()) revenue += row.amount;
  return { orders: totals.size, revenue };
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
