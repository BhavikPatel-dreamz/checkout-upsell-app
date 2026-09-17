import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { SURFACE_LABELS, SHOP_WIDE_EXPERIMENT_ID } from "../ai/learn/incrementality";
import { GOAL_LABELS, primaryIncrementForGoal } from "../ai/learn/goal";
import { getMerchantRuleSet } from "../models/merchantRuleSet.server";

function money(value: unknown): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatPrimary(
  goal: Parameters<typeof primaryIncrementForGoal>[0],
  row: {
    incrementalRevenue: unknown;
    treatedAov: unknown;
    holdoutAov: unknown;
    treatedConversion: unknown;
    holdoutConversion: unknown;
  },
  minMarginPercent: number | null,
): string {
  const primary = primaryIncrementForGoal(
    goal,
    {
      incrementalRevenue: Number(row.incrementalRevenue),
      treatedAov: Number(row.treatedAov),
      holdoutAov: Number(row.holdoutAov),
      treatedConversion: Number(row.treatedConversion),
      holdoutConversion: Number(row.holdoutConversion),
    },
    { minMarginPercent },
  );
  if (primary.unit === "percent" || primary.unit === "points") {
    return `${primary.value >= 0 ? "+" : ""}${(primary.value * 100).toFixed(1)} pts`;
  }
  return `$${money(primary.value)}`;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const rows = await db.incrementalityStat.findMany({
    where: { shop: session.shop },
    orderBy: [{ computedAt: "desc" }, { surface: "asc" }, { experimentId: "asc" }],
    take: 50,
  });
  const experiments = await db.experiment.findMany({
    where: { shop: session.shop, id: { in: rows.map((row) => row.experimentId).filter((id) => id !== SHOP_WIDE_EXPERIMENT_ID) } },
    select: { id: true, name: true },
  });
  const names = Object.fromEntries(experiments.map((row) => [row.id, row.name]));
  const merchant = await getMerchantRuleSet(session.shop);
  return {
    rows,
    names,
    optimizationGoal: merchant.optimizationGoal,
    minMarginPercent: merchant.minMarginPercent,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const { rebuildIncrementalityStats } = await import("../jobs/incrementality.server");
  const result = await rebuildIncrementalityStats(session.shop);
  return { ok: true as const, result };
}

export default function IncrementalityPage() {
  const { rows, names, optimizationGoal, minMarginPercent } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <s-page heading="Incrementality">
      <s-section heading="Treated vs holdout">
        <s-paragraph>
          Shop optimization goal: {GOAL_LABELS[optimizationGoal]}. All treated vs
          holdout metrics stay visible; the primary metric is highlighted per
          that goal. Conversion is orders per assigned identity; AOV is revenue
          per order. Last 7 days. Surfaces: PDP, cart, popup, thank-you, recovery.
          Experience copy/layout for treated shoppers is chosen by a bandit;
          holdout never enters that choice.
        </s-paragraph>
        <Form method="post">
          <s-button type="submit" variant="primary">
            Recalculate
          </s-button>
        </Form>
        {actionData?.ok ? <s-paragraph>Updated {actionData.result.rows} rollup(s).</s-paragraph> : null}
      </s-section>

      <s-section>
        {rows.length === 0 ? (
          <s-paragraph>No incrementality rollups yet. Recalculate after decide has assigned holdout and treated shoppers.</s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {rows.map((row) => (
              <s-section
                key={row.id}
                heading={
                  (row.experimentId === SHOP_WIDE_EXPERIMENT_ID
                    ? "Shop-wide"
                    : names[row.experimentId] ?? row.experimentId) +
                  " · " +
                  (SURFACE_LABELS[row.surface] ?? row.surface)
                }
              >
                <s-paragraph>
                  Primary ({GOAL_LABELS[optimizationGoal]}):{" "}
                  {formatPrimary(optimizationGoal, row, minMarginPercent)}
                </s-paragraph>
                <s-paragraph>
                  Incremental revenue: ${money(row.incrementalRevenue)} · Treated conversion{" "}
                  {pct(row.treatedConversion)} vs holdout {pct(row.holdoutConversion)} · Treated AOV $
                  {money(row.treatedAov)} vs holdout ${money(row.holdoutAov)}
                </s-paragraph>
                <s-paragraph>
                  Treated {row.treatedUsers} shoppers / {row.treatedOrders} orders / ${money(row.treatedRevenue)} ·
                  Holdout {row.holdoutUsers} shoppers / {row.holdoutOrders} orders / ${money(row.holdoutRevenue)}
                </s-paragraph>
              </s-section>
            ))}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}
