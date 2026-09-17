export const OPTIMIZATION_GOALS = ["revenue", "aov", "conversion", "profit"] as const;

export type OptimizationGoal = (typeof OPTIMIZATION_GOALS)[number];

export const DEFAULT_OPTIMIZATION_GOAL: OptimizationGoal = "revenue";

export const GOAL_LABELS: Record<OptimizationGoal, string> = {
  revenue: "Incremental revenue",
  aov: "Average order value",
  conversion: "Conversion",
  profit: "Profit (requires margin data)",
};

export function isOptimizationGoal(value: unknown): value is OptimizationGoal {
  return typeof value === "string" && (OPTIMIZATION_GOALS as readonly string[]).includes(value);
}

/** Profit is only kept when the shop has margin/cost data; otherwise fall back to revenue. */
export function normalizeOptimizationGoal(
  value: unknown,
  options: { allowProfit?: boolean } = {},
): OptimizationGoal {
  if (!isOptimizationGoal(value)) return DEFAULT_OPTIMIZATION_GOAL;
  if (value === "profit" && options.allowProfit === false) return DEFAULT_OPTIMIZATION_GOAL;
  return value;
}

export function primaryIncrementForGoal(
  goal: OptimizationGoal,
  stats: {
    incrementalRevenue: number;
    treatedAov: number;
    holdoutAov: number;
    treatedConversion: number;
    holdoutConversion: number;
  },
  options: { minMarginPercent?: number | null } = {},
): { goal: OptimizationGoal; label: string; value: number; unit: "money" | "percent" | "points" } {
  if (goal === "aov") {
    return { goal, label: GOAL_LABELS.aov, value: stats.treatedAov - stats.holdoutAov, unit: "money" };
  }
  if (goal === "conversion") {
    return {
      goal,
      label: GOAL_LABELS.conversion,
      value: stats.treatedConversion - stats.holdoutConversion,
      unit: "points",
    };
  }
  if (goal === "profit") {
    const margin = options.minMarginPercent;
    const factor = margin != null && margin > 0 ? Math.min(100, margin) / 100 : 1;
    return {
      goal,
      label: GOAL_LABELS.profit,
      value: Math.round(stats.incrementalRevenue * factor * 100) / 100,
      unit: "money",
    };
  }
  return {
    goal: "revenue",
    label: GOAL_LABELS.revenue,
    value: stats.incrementalRevenue,
    unit: "money",
  };
}
