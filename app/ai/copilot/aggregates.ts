import { GOAL_LABELS, type OptimizationGoal } from "../learn/goal";
import { SURFACE_LABELS } from "../learn/incrementality";

const FORBIDDEN_KEY =
  /^(.*)?(customerid|customer_id|email|phone|sessionid|session_id|anonid|anon_id|eventid|event_id|guestkey|ipaddress|rawevents?|shopperevents?)$/i;

export interface CopilotIncrementalityRow {
  experimentId: string;
  surface: string;
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

export interface CopilotMomentRow {
  kind: string;
  status: string;
  support: number;
  lift: number;
  expectedImpact: number;
  productId: string;
  relatedProductId: string;
}

export interface CopilotAggregates {
  shop: string;
  optimizationGoal: OptimizationGoal;
  holdoutPercent: number;
  maxDiscountPercent: number;
  offers: { total: number; active: number; draft: number };
  campaigns: { total: number; draft: number; active: number };
  incrementality: CopilotIncrementalityRow[];
  moments: CopilotMomentRow[];
}

export function stripForbiddenKeys<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripForbiddenKeys(item)) as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEY.test(key.replace(/[^a-zA-Z0-9]/g, ""))) continue;
      out[key] = stripForbiddenKeys(nested);
    }
    return out as T;
  }
  return value;
}

export function aggregatesHaveForbiddenKeys(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(aggregatesHaveForbiddenKeys);
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(([key, nested]) => {
      const compact = key.replace(/[^a-zA-Z0-9]/g, "");
      return FORBIDDEN_KEY.test(compact) || aggregatesHaveForbiddenKeys(nested);
    });
  }
  return false;
}

export function formatAggregatesForPrompt(aggregates: CopilotAggregates): string {
  const safe = stripForbiddenKeys(aggregates);
  return JSON.stringify(safe);
}

function shopWideRow(rows: CopilotIncrementalityRow[]): CopilotIncrementalityRow | undefined {
  return rows.find((row) => row.experimentId === "_" && row.surface === "_") ?? rows[0];
}

/**
 * Deterministic copilot answers from aggregates only (no LLM, no event rows).
 */
export function answerFromAggregates(question: string, aggregates: CopilotAggregates): string {
  const q = question.trim().toLowerCase();
  const goal = GOAL_LABELS[aggregates.optimizationGoal];
  const north = shopWideRow(aggregates.incrementality);

  if (/moment|affinity|lift/.test(q) && !/incremental|holdout/.test(q)) {
    const open = aggregates.moments.filter((row) => row.status === "detected").slice(0, 5);
    if (open.length === 0) {
      return "No open Smart Moments in the aggregate snapshot. Run Detect on Smart Moments after affinity jobs.";
    }
    const lines = open.map(
      (row) =>
        `${row.kind}: lift ${row.lift.toFixed(2)}, support ${row.support}, expected impact ${row.expectedImpact.toFixed(1)} (${row.productId} → ${row.relatedProductId})`,
    );
    return `Top detected Smart Moments (aggregates only):\n${lines.join("\n")}\nActivate creates a draft campaign; Standard does not auto-publish.`;
  }

  if (/goal|aov|conversion|profit/.test(q) && !/incremental revenue/.test(q)) {
    return `This shop's optimization goal is ${goal}. Holdout is ${aggregates.holdoutPercent}% (always on). Max discount cap is ${aggregates.maxDiscountPercent}%.`;
  }

  if (/campaign|draft|offer|upsell/.test(q) && !/incremental/.test(q)) {
    return `Offers: ${aggregates.offers.total} total (${aggregates.offers.active} active, ${aggregates.offers.draft} draft). Campaigns: ${aggregates.campaigns.total} (${aggregates.campaigns.active} active, ${aggregates.campaigns.draft} draft). Standard merchants review drafts before they go live.`;
  }

  if (north) {
    const surfaceBits = aggregates.incrementality
      .filter((row) => row.surface !== "_" && row.experimentId === "_")
      .map((row) => `${SURFACE_LABELS[row.surface] ?? row.surface}: $${Number(row.incrementalRevenue).toFixed(2)}`)
      .join("; ");
    return [
      `Shop-wide treated vs holdout (aggregates, not raw events). Optimization goal: ${goal}.`,
      `Incremental revenue: $${Number(north.incrementalRevenue).toFixed(2)}. Treated conversion ${(north.treatedConversion * 100).toFixed(1)}% vs holdout ${(north.holdoutConversion * 100).toFixed(1)}%. Treated AOV $${Number(north.treatedAov).toFixed(2)} vs holdout $${Number(north.holdoutAov).toFixed(2)}.`,
      `Treated ${north.treatedUsers} shoppers vs holdout ${north.holdoutUsers}.`,
      surfaceBits ? `By surface: ${surfaceBits}.` : "",
      "Copilot never sees individual browse or purchase events.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  return "No incrementality rollups in the aggregate snapshot yet. Recalculate incrementality after decide has assigned holdout and treated shoppers.";
}
