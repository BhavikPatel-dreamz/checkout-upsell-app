import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getSyncStatus } from "../models/productVariant.server";
import { listSyncLogs } from "../models/syncLog.server";
import { productSyncAction } from "../lib/productSync.server";

// Client-side loop safety: 400 chunks × 250 variants = 100k variants. Shopify's
// cursor pagination always terminates on its own; this only guards a bug.
const MAX_CHUNKS = 400;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [status, logs] = await Promise.all([
    getSyncStatus(session.shop),
    listSyncLogs(session.shop, 10),
  ]);
  return { ...status, logs };
};

// One chunk (one 250-variant page) per POST. The client re-submits with the
// returned cursor until `done`, so no single request risks the action timeout.
export const action = async (args: ActionFunctionArgs) => productSyncAction(args);

function badgeTone(status: string) {
  if (status === "success") return "success" as const;
  if (status === "error") return "critical" as const;
  if (status === "running") return "info" as const;
  return "neutral" as const;
}

function formatDuration(startedAt: string | Date, finishedAt: string | Date | null) {
  if (!finishedAt) return "—";
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  const secs = Math.max(0, Math.round(ms / 1000));
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

export default function DashboardPage() {
  const { variantCount, lastSyncedAt, logs } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const data = fetcher.data;

  const busy = fetcher.state !== "idle";
  const inProgress = data?.ok === true && data.done === false;
  const running = busy || inProgress;

  const liveCount = data?.ok === true ? data.upserted : 0;
  const estimate = data?.ok === true ? data.estimated : null;
  const pageNo = data?.ok === true ? data.pages : 0;
  const pct =
    estimate && estimate > 0
      ? Math.min(99, Math.round((liveCount / estimate) * 100))
      : null;
  const fallbackPct = pageNo > 0 ? Math.min(95, pageNo * 18) : 8;
  const [displayPct, setDisplayPct] = useState<number>(fallbackPct);

  useEffect(() => {
    const target = pct ?? fallbackPct;
    let frameId: number;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      let reached = false;

      setDisplayPct((prev) => {
        const diff = target - prev;
        if (Math.abs(diff) < 0.15) {
          reached = true;
          return target;
        }
        return prev + diff * 0.12;
      });

      if (!reached) {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    frameId = window.requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
    };
  }, [pct, fallbackPct]);

  const [simCount, setSimCount] = useState(0);

  useEffect(() => {
    if (!running) {
      setSimCount(0);
      return;
    }

    const target = Math.max(variantCount, 1);
    const start = Date.now();
    const ratePerSecond = Math.max(target / 6, 15);

    const id = window.setInterval(() => {
      const elapsedSeconds = (Date.now() - start) / 1000;
      setSimCount((prev) => {
        const next = Math.min(target * 0.95, elapsedSeconds * ratePerSecond);
        return next > prev ? next : prev;
      });
    }, 100);

    return () => window.clearInterval(id);
  }, [running, variantCount]);

  const effectiveLiveCount = liveCount > 0 ? liveCount : Math.round(simCount);

  // Auto-advance: when a non-final chunk returns and the fetcher is idle,
  // submit the next chunk with the threaded cursor + running totals.
  useEffect(() => {
    if (fetcher.state !== "idle") return;
    if (!data || data.ok !== true || data.done) return;
    if (data.pages >= MAX_CHUNKS) return;

    const next = new FormData();
    next.set("intent", "chunk");
    next.set("runId", data.runId);
    next.set("startedAt", data.startedAt);
    if (data.estimated != null) next.set("estimated", String(data.estimated));
    next.set("upserted", String(data.upserted));
    next.set("pages", String(data.pages));
    if (data.cursor) next.set("cursor", data.cursor);
    fetcher.submit(next, { method: "post" });
  }, [data, fetcher]);

  return (
    <s-page heading="Checkout Upsell">
      <s-section heading="Build higher-value carts with relevant offers">
        <s-paragraph>
          Create targeted upsell offers, place them in supported Shopify
          surfaces, and measure their impact on order value.
        </s-paragraph>
      </s-section>

      <s-section heading="Product catalog">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Sync your products and their variants from Shopify so they can be
            suggested as upsells. Each variant is stored as its own row.
          </s-paragraph>

          <s-paragraph tone="neutral" color="subdued">
            {variantCount > 0
              ? `${variantCount} variant${variantCount === 1 ? "" : "s"} synced`
              : "No products synced yet."}
            {lastSyncedAt
              ? ` · Last synced ${new Date(lastSyncedAt).toLocaleString()}`
              : ""}
          </s-paragraph>

          {running ? (
            <s-stack direction="block" gap="base">
              {pct != null ? (
                <div
                  role="progressbar"
                  aria-valuenow={Math.round(displayPct)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Product sync progress"
                  style={{
                    width: "100%",
                    height: "8px",
                    background: "rgba(0, 0, 0, 0.08)",
                    borderRadius: "4px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${displayPct}%`,
                      height: "100%",
                      background: "#008060",
                      borderRadius: "4px",
                      transition: "width 220ms ease-out",
                    }}
                  />
                </div>
              ) : (
                <div
                  role="progressbar"
                  aria-valuenow={Math.round(displayPct)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Product sync progress"
                  style={{
                    width: "100%",
                    height: "8px",
                    background: "rgba(0, 0, 0, 0.08)",
                    borderRadius: "4px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${displayPct}%`,
                      height: "100%",
                      background: "#008060",
                      borderRadius: "4px",
                      transition: "width 220ms ease-out",
                    }}
                  />
                </div>
              )}
              <s-paragraph tone="neutral" color="subdued">
                {pct != null ? `Syncing… ${pct}% · ` : "Syncing… "}
                {`${effectiveLiveCount} variant${effectiveLiveCount === 1 ? "" : "s"}`}
                {pageNo > 0 ? ` · page ${pageNo}` : ""}
              </s-paragraph>
            </s-stack>
          ) : null}

          {data?.ok === true && data.done === true ? (
            <s-banner tone="success" heading="Sync complete">
              {`Synced ${data.upserted} variant${
                data.upserted === 1 ? "" : "s"
              }` +
                (data.removed > 0 ? `, removed ${data.removed} stale` : "") +
                "."}
            </s-banner>
          ) : null}

          {data?.ok === false ? (
            <s-banner tone="critical" heading="Sync failed">
              {data.error}
            </s-banner>
          ) : null}

          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="start" />
            <s-button
              type="submit"
              variant="primary"
              loading={running}
              disabled={running}
            >
              {variantCount > 0 ? "Re-sync products" : "Sync products"}
            </s-button>
          </fetcher.Form>
        </s-stack>
      </s-section>

      <s-section heading="Sync history">
        {logs.length > 0 ? (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Date</s-table-header>
              <s-table-header listSlot="labeled">Status</s-table-header>
              <s-table-header listSlot="labeled">Variants</s-table-header>
              <s-table-header listSlot="labeled">Removed</s-table-header>
              <s-table-header listSlot="labeled">Duration</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {logs.map((log) => (
                <s-table-row key={log.id}>
                  <s-table-cell>
                    {new Date(log.startedAt).toLocaleString()}
                  </s-table-cell>
                  <s-table-cell>
                    <s-badge tone={badgeTone(log.status)}>{log.status}</s-badge>
                  </s-table-cell>
                  <s-table-cell>{log.upserted}</s-table-cell>
                  <s-table-cell>{log.removed}</s-table-cell>
                  <s-table-cell>
                    {formatDuration(log.startedAt, log.finishedAt)}
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        ) : (
          <s-paragraph tone="neutral" color="subdued">
            No sync runs yet.
          </s-paragraph>
        )}
      </s-section>

      <s-section heading="Getting started">
        <s-paragraph>
          Start by creating an offer, then add the upsell block in the Theme
          Editor when that integration is available.
        </s-paragraph>
        <s-button href="/app/offers" variant="primary">
          View offers
        </s-button>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
