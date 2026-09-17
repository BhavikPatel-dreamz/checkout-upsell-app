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
