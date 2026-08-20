/* eslint-disable @typescript-eslint/no-explicit-any */
// =======================================================================
// app/routes/app.product-sync.tsx
//
// Chunk-and-checkpoint sync flow. ONE authoritative source of truth per
// run: the SyncLog row itself (id/status/upserted/cursor/pages/estimated).
// The UI never simulates, polls, or animates a fake number — it always
// renders exactly what's persisted.
//
// - Chunks are 25 variants each (see PAGE_SIZE in productVariant.server.ts).
// - A chunk only counts once syncProductsChunk's $transaction has fully
//   committed it — recordChunk() is the ONLY place `upserted`/`cursor`/
//   `pages` ever advance.
// - On page load, the loader looks for the shop's one active run
//   (status "running" or "paused") and returns it as `activeRun`. If one
//   exists, the UI shows "Sync interrupted" + the real checkpoint + a
//   Resume Sync button immediately — no click required, no polling.
// - Stop persists status "paused" without touching the checkpoint.
// - Resume always reuses the same runId and the same persisted cursor.
// =======================================================================

import { useEffect, useRef, useState } from "react";
import {
  useFetcher,
  useLoaderData,
  useNavigate,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { authenticate } from "../shopify.server";
import { productSyncAction } from "../lib/productSync.server";
import {
  getShopifyProductCatalog,
  getSyncStatus,
} from "../models/productVariant.server";
import db from "../db.server";

const MAX_CHUNKS = 400;

// Mirrors PAGE_SIZE in productVariant.server.ts. Used ONLY to drive the
// progress bar's variant-by-variant animation (1, 2, 3 ... 25, then 26, 27,
// 28 ...) — never sent to the server, never affects real chunking.
const UI_CHUNK_SIZE = 25;

// =======================================================================
// Loader
// =======================================================================
export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const [syncStatus, recentLogs, shopifyProducts, syncLogs, activeRun] = await Promise.all([
    getSyncStatus(shop),
    db.syncLog.findMany({
      where: { shop, startedAt: { gte: sevenDaysAgo } },
      orderBy: { startedAt: "asc" },
    }),
    getShopifyProductCatalog(admin, shop),
    db.syncLog.findMany({
      where: { shop },
      orderBy: { startedAt: "desc" },
      take: 20,
    }),
    // The single authoritative "in-progress" checkpoint for this shop, if any.
    db.syncLog.findFirst({
      where: { shop, status: { in: ["running", "paused"] } },
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        status: true,
        upserted: true,
        estimated: true,
        cursor: true,
        pages: true,
        startedAt: true,
      },
    }),
  ]);

  const syncedRows = await db.productVariant.findMany({
    where: { shop },
    select: { productId: true, variantId: true, productTitle: true, updatedAt: true },
  });

  const syncedVariantIds = new Set(syncedRows.map((row) => row.variantId));
  const syncedProductIds = new Set(syncedRows.map((row) => row.productId));

  const products: ProductSummary[] = shopifyProducts
    .map((product) => {
      const variants = product.variants?.nodes ?? [];
      const totalVariants = variants.length;
      const syncedVariants = variants.filter((variant: any) => syncedVariantIds.has(variant.id)).length;
      const synced = totalVariants > 0 ? syncedVariants === totalVariants : syncedProductIds.has(product.id);

      return {
        productId: product.id,
        title: product.title,
        imageUrl: product.featuredMedia?.preview?.image?.url ?? null,
        handle: product.handle,
        status: product.status ?? "UNKNOWN",
        productDescription: product.description ?? null,
        totalVariants,
        syncedVariants,
        synced,
        updatedAt: product.updatedAt ? new Date(product.updatedAt) : new Date(),
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));

  const totalProducts = products.length;
  const syncedProducts = products.filter((product) => product.synced).length;
  const notSyncedProducts = totalProducts - syncedProducts;
  const totalVariants = products.reduce((sum, product) => sum + product.totalVariants, 0);
  const syncedVariants = products.reduce((sum, product) => sum + product.syncedVariants, 0);
  const notSyncedVariants = totalVariants - syncedVariants;

  const dayLabels: string[] = [];
  const dayBuckets: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dayLabels.push(d.toLocaleDateString(undefined, { weekday: "short" }));
    dayBuckets.push(0);
  }
  for (const log of recentLogs) {
    const diffDays = Math.floor(
      (log.startedAt.getTime() - sevenDaysAgo.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (diffDays >= 0 && diffDays < 7) {
      dayBuckets[diffDays] += log.upserted;
    }
  }

  const syncedPercent = totalProducts > 0 ? Math.round((syncedProducts / totalProducts) * 1000) / 10 : 100;

  return {
    shop,
    lastSyncedAt: syncStatus.lastSyncedAt,
    totalProducts,
    syncedProducts,
    notSyncedProducts,
    totalVariants,
    syncedVariants,
    notSyncedVariants,
    syncedPercent,
    products,
    logs: syncLogs,
    trend: { labels: dayLabels, values: dayBuckets },
    activeRun,
  };
}

// =======================================================================
// Action — unchanged sync trigger, same handler used elsewhere already.
// =======================================================================
export async function action(args: ActionFunctionArgs) {
  return productSyncAction(args);
}

// =======================================================================
// Types
// =======================================================================
interface ProductSummary {
  productId: string;
  title: string;
  imageUrl: string | null;
  handle: string | null;
  status: string | null;
  productDescription: string | null;
  totalVariants: number;
  syncedVariants: number;
  synced: boolean;
  updatedAt: Date;
}

type RunStatus = "running" | "paused" | "success" | "error";

// =======================================================================
// Component
// =======================================================================
export default function ProductSyncPage() {
  const {
    lastSyncedAt,
    totalProducts,
    syncedProducts,
    notSyncedProducts,
    totalVariants,
    syncedVariants,
    notSyncedVariants,
    syncedPercent,
    trend,
    logs,
    activeRun,
  } = useLoaderData<typeof loader>();

  const navigate = useNavigate();
  const syncFetcher = useFetcher<{
    ok?: boolean;
    done?: boolean;
    paused?: boolean;
    upserted?: number;
    removed?: number;
    estimated?: number | null;
    pages?: number;
    runId?: string;
    startedAt?: string;
    cursor?: string | null;
    error?: string;
  }>();

  const data = syncFetcher.data;
  const busy = syncFetcher.state !== "idle";

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Only true once the USER clicks Sync/Resume during THIS page load.
  // Prevents the chunk loop from ever auto-firing on reload/remount.
  const userInitiatedRef = useRef(false);
  // Set by the Stop button. Checked by the auto-advance effect: the chunk
  // currently in flight (if any) is always allowed to finish and persist
  // its checkpoint — this flag only stops the NEXT chunk from starting.
  const stopRequestedRef = useRef(false);

  // ---- The single checkpoint the whole UI reads from -------------------
  // Before any client action: activeRun from the loader (the DB's truth
  // at page-load time). After any action: `data`, the freshest server
  // response. Never any other source — no simulated/animated numbers.
  const currentRunId = data?.runId ?? activeRun?.id ?? null;
  const processed = data?.ok ? data.upserted ?? 0 : activeRun?.upserted ?? 0;
  // Treat a 0/falsy estimate as "no estimate" so it doesn't zero out the
  // denominator via ?? (0 ?? fallback still resolves to 0, not the fallback).
  const estimatedTotal = data?.ok
    ? (data.estimated && data.estimated > 0 ? data.estimated : null)
    : (activeRun?.estimated && activeRun.estimated > 0 ? activeRun.estimated : null);
  const chunkCount = data?.ok ? data.pages ?? 0 : activeRun?.pages ?? 0;

  const currentStatus: RunStatus | null = data?.ok
    ? data.done
      ? data.paused
        ? "paused"
        : "success"
      : "running"
    : data?.ok === false
      ? "error"
      : (activeRun?.status as RunStatus | undefined) ?? null;

  // Actively looping in THIS tab right now (a chunk is in flight, or one
  // was just returned and the next is about to be submitted).
  const isSyncing = userInitiatedRef.current && (busy || (data?.ok === true && data.done === false));
  // Exists in the DB as an unfinished run, but nothing is actively looping
  // right now — true on fresh load with a leftover run, and true the
  // instant Stop finishes freezing the checkpoint.
  const isResumable = !isSyncing && (currentStatus === "running" || currentStatus === "paused");

  const denominator = estimatedTotal ?? (totalVariants > 0 ? totalVariants : null);
  // Once any chunk has actually processed rows, show at least 1% instead of
  // letting Math.round floor small fractions back down to 0 — that's what was
  // making the bar sit at "0%" instead of ticking 1%, 2%, 3%...
  const pct = denominator
    ? processed > 0
      ? Math.max(1, Math.min(100, Math.round((processed / denominator) * 100)))
      : 0
    : null;

  // ---- Cosmetic-only smoothing ------------------------------------------
  // `processed` only advances in discrete jumps of 25 (or fewer, on the last
  // page) once a chunk's response lands. `displayProcessed` instead counts up
  // variant-by-variant — 1, 2, 3 ... 25 — while that chunk is in flight, then
  // continues from 26, 27, 28 ... for the next one. It always chases toward
  // `processed + UI_CHUNK_SIZE` (capped at the real denominator), and the
  // instant a chunk actually completes, `processed` itself catches it up to
  // the true value — so it can never drift ahead of reality, only visually
  // fill in the wait between chunks. Purely visual: never fed back into
  // state, requests, or the checkpoint.
  const [displayProcessed, setDisplayProcessed] = useState(0);

  useEffect(() => {
    if (!isSyncing && !isResumable) {
      setDisplayProcessed(0);
      return;
    }

    // Never show less than the real, persisted count.
    setDisplayProcessed((current) => Math.max(current, processed));

    if (!isSyncing) return; // resumable-but-idle: hold at the real count

    const ceiling = denominator != null
      ? Math.min(denominator, processed + UI_CHUNK_SIZE)
      : processed + UI_CHUNK_SIZE;

    const stepMs = 80; // ~2s to count through a 25-variant chunk
    const intervalId = setInterval(() => {
      setDisplayProcessed((current) => {
        const base = Math.max(current, processed);
        if (base >= ceiling) return base;
        return base + 1;
      });
    }, stepMs);

    return () => clearInterval(intervalId);
  }, [processed, denominator, isSyncing, isResumable]);

  const displayPct = denominator
    ? displayProcessed > 0
      ? Math.max(1, Math.min(100, Math.round((displayProcessed / denominator) * 100)))
      : 0
    : null;

  // Auto-advance the chunk loop. Only runs once the user has actually
  // started/resumed in this session (userInitiatedRef) — never on its own.
  useEffect(() => {
    if (!userInitiatedRef.current) return;
    if (syncFetcher.state !== "idle") return;
    if (!data || data.ok !== true || data.done) return;
    if ((data.pages ?? 0) >= MAX_CHUNKS) return;

    if (stopRequestedRef.current) {
      // The chunk that just completed is safely persisted. Freeze here
      // instead of starting another one.
      const stopForm = new FormData();
      stopForm.set("intent", "stop");
      stopForm.set("runId", data.runId ?? "");
      syncFetcher.submit(stopForm, { method: "post" });
      return;
    }

    const next = new FormData();
    next.set("intent", "chunk");
    next.set("runId", data.runId ?? "");
    next.set("startedAt", data.startedAt ?? new Date().toISOString());
    if (data.estimated != null) next.set("estimated", String(data.estimated));
    next.set("upserted", String(data.upserted ?? 0));
    next.set("pages", String(data.pages ?? 0));
    if (data.cursor) next.set("cursor", data.cursor);

    syncFetcher.submit(next, { method: "post" });
  }, [data, syncFetcher]);

  function handleResume(runId: string) {
    userInitiatedRef.current = true;
    stopRequestedRef.current = false;
    const fd = new FormData();
    fd.set("intent", "resume");
    fd.set("runId", runId);
    syncFetcher.submit(fd, { method: "post" });
  }

  function handleStop() {
    stopRequestedRef.current = true;
  }

  return (
    <div style={styles.page}>
      {/* ---- Top bar (matches other pages in this app) ---- */}
      <div style={styles.navBar}>
        <div style={styles.navLeft}>
          <span style={styles.logoMark}>D</span>
          <span style={styles.logoText}>Dynamic Dreamz</span>
        </div>
        <div style={styles.navTabs}>
          <button style={styles.navTab} onClick={() => navigate("/app")}>
            Dashboard
          </button>
          <button style={{ ...styles.navTab, ...styles.navTabActive }}>Product Sync</button>
          <button style={styles.navTab} onClick={() => navigate("/app")}>
            Help
          </button>
        </div>
      </div>

      <div style={styles.content}>
        {/* ---- Header ---- */}
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.pageTitle}>Product Sync</h1>
            <p style={styles.pageSubtitle}>
              Sync products and variants from your connected Shopify store.
            </p>
          </div>
        </div>

        {/* ---- Sync controls ---- */}
        <div style={styles.syncControlsRow}>
          {isSyncing ? (
            <>
              <button
                type="button"
                disabled
                style={{ ...styles.darkButton, opacity: 0.7, cursor: "not-allowed" }}
              >
                <Spinner /> Syncing products...
              </button>
              <button type="button" style={styles.outlineButton} onClick={handleStop}>
                Stop Sync
              </button>
            </>
          ) : isResumable && currentRunId ? (
            <button
              type="button"
              style={styles.darkButton}
              onClick={() => handleResume(currentRunId)}
            >
              Resume Sync
            </button>
          ) : (
            <syncFetcher.Form
              method="post"
              encType="multipart/form-data"
              onSubmit={() => {
                userInitiatedRef.current = true;
                stopRequestedRef.current = false;
              }}
            >
              <input type="hidden" name="intent" value="start" />
              <button type="submit" style={styles.darkButton}>
                Sync Products Now
              </button>
            </syncFetcher.Form>
          )}

          {isResumable && (
            <span style={styles.errorBadge}>
              Sync interrupted — {processed} / {denominator ?? "?"} variants processed
            </span>
          )}

          {!isSyncing && !isResumable && lastSyncedAt && (
            <span style={styles.lastSyncedBadge}>
              Last synced: {isMounted ? timeAgo(new Date(lastSyncedAt)) : formatStableDate(new Date(lastSyncedAt))}
            </span>
          )}

          {currentStatus === "success" && data?.ok === true && (
            <span style={styles.lastSyncedBadge}>
              Synced {data.upserted ?? 0} variants
              {data.removed ? `, removed ${data.removed} stale` : ""}
            </span>
          )}

          {data?.ok === false && (
            <span style={styles.errorBadge}>{data.error ?? "Product sync failed."}</span>
          )}
        </div>

        {/* Progress reflects ONLY the persisted checkpoint — no simulated numbers. */}
        {(isSyncing || isResumable) && (
          <div style={styles.progressPanel}>
            <div style={styles.progressHeader}>
              <div style={styles.progressLabel}>
                {isSyncing ? "Syncing products..." : "Sync interrupted"}
              </div>
              <div style={styles.progressValue}>{pct != null ? `${displayPct}%` : "—"}</div>
            </div>
            <div
              style={styles.progressTrack}
              role="progressbar"
              aria-valuenow={displayPct ?? undefined}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Product sync progress"
            >
              <div style={{ ...styles.progressFill, width: `${displayPct}%` }} />
            </div>
            <div style={styles.progressMeta}>
              Processed {displayProcessed} of {denominator ?? "?"} variants
              {chunkCount > 0 ? ` · chunk ${chunkCount}` : ""}
            </div>
          </div>
        )}

        {/* ---- Stat cards ---- */}
        <div style={styles.statGrid}>
          <StatCard icon="product" label="Total Products" value={totalProducts} note="All products in store" />
          <StatCard icon="tag" label="Total Variants" value={totalVariants} note="All variants in store" />
          <StatCard
            icon="check"
            label="Synced Products"
            value={syncedProducts}
            note="Successfully synced"
            tone="green"
          />
          <StatCard
            icon="warning"
            label="Not Synced"
            value={notSyncedProducts}
            note="Not yet synced"
            tone="orange"
          />
          <StatCard
            icon="check"
            label="Synced Variants"
            value={syncedVariants}
            note="Successfully synced"
            tone="green"
          />
          <StatCard
            icon="warning"
            label="Not Synced Variants"
            value={notSyncedVariants}
            note="Not yet synced"
            tone="orange"
          />
        </div>

        {/* ---- Overview + trend ---- */}
        <div style={styles.chartsRow}>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Sync Overview</h3>
            <div style={styles.overviewBody}>
              <Donut percent={syncedPercent} />
              <div style={styles.overviewLegend}>
                <LegendRow color="#5c5ffb" label="Synced Variants" value={syncedVariants} />
                <LegendRow color="#d72c0d" label="Not Synced Variants" value={notSyncedVariants} />
              </div>
            </div>
          </div>

          <div style={{ ...styles.card, flex: 2 }}>
            <div style={styles.chartHeader}>
              <h3 style={styles.cardTitle}>Sync Activity (Last 7 Days)</h3>
            </div>
            <TrendChart labels={trend.labels} values={trend.values} />
          </div>
        </div>

        {/* ---- Sync log ---- */}
        <div style={styles.card}>
          <div style={styles.chartHeader}>
            <h3 style={styles.cardTitle}>Sync Log</h3>
          </div>

          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Started</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Upserted</th>
                <th style={styles.th}>Removed</th>
                <th style={styles.th}>Duration</th>
                <th style={styles.th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td style={styles.emptyCell} colSpan={6}>
                    No sync runs have been recorded yet.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const resumable = log.status === "running" || log.status === "paused";
                  return (
                    <tr key={log.id} style={styles.tr}>
                      <td style={styles.td}>
                        {isMounted ? timeAgo(new Date(log.startedAt)) : formatStableDate(new Date(log.startedAt))}
                      </td>
                      <td style={styles.td}>
                        <span
                          style={{
                            ...styles.badge,
                            ...(log.status === "success"
                              ? styles.badgeActive
                              : log.status === "paused"
                                ? { ...styles.badge, background: "#fdf1e3", color: "#b45f06" }
                                : log.status === "running"
                                  ? { ...styles.badge, background: "#dfe9ff", color: "#2140a8" }
                                  : styles.badgeArchived),
                          }}
                        >
                          {resumable ? "Resume" : log.status}
                        </span>
                      </td>
                      <td style={styles.td}>{log.upserted}</td>
                      <td style={styles.td}>{log.removed}</td>
                      <td style={styles.td}>{formatDuration(log.startedAt, log.finishedAt)}</td>
                      <td style={styles.td}>
                        {resumable && (
                          <button
                            type="button"
                            style={styles.outlineButtonLink}
                            disabled={isSyncing}
                            onClick={() => handleResume(log.id)}
                          >
                            Resume
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------
function StatCard({
  icon,
  label,
  value,
  note,
  tone,
}: {
  icon: "product" | "check" | "warning" | "tag";
  label: string;
  value: number;
  note: string;
  tone?: "green" | "orange";
}) {
  return (
    <div style={styles.statCard}>
      <div
        style={{
          ...styles.statIcon,
          ...(tone === "green"
            ? { background: "#e3f6e5", color: "#1a7f37" }
            : tone === "orange"
              ? { background: "#fdf1e3", color: "#b45f06" }
              : { background: "#eef1fb", color: "#3a4dab" }),
        }}
      >
        <StatusIcon name={icon} />
      </div>
      <div>
        <div style={styles.statLabel}>{label}</div>
        <div style={styles.statValue}>{value.toLocaleString()}</div>
        <div style={styles.statNote}>{note}</div>
      </div>
    </div>
  );
}

function StatusIcon({ name }: { name: "product" | "check" | "warning" | "tag" }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "check") {
    return <svg {...common}><path d="m5 12 4.2 4.2L19 6.5" /></svg>;
  }
  if (name === "warning") {
    return <svg {...common}><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>;
  }
  if (name === "tag") {
    return <svg {...common}><path d="M20 13 13 20 3 10V4h6l11 9Z" /><circle cx="7.5" cy="7.5" r="1" fill="currentColor" stroke="none" /></svg>;
  }
  return <svg {...common}><path d="M4 8h16v12H4z" /><path d="M8 8V5h8v3M4 12h16M10 12v2h4v-2" /></svg>;
}

function LegendRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div style={styles.legendRow}>
      <span style={{ ...styles.legendDot, background: color }} />
      <span style={styles.legendLabel}>{label}</span>
      <span style={styles.legendValue}>{value}</span>
    </div>
  );
}

function Donut({ percent }: { percent: number }) {
  const size = 140;
  const stroke = 16;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.min(100, Math.max(0, percent)) / 100) * circumference;

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#f1f2f3"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1a7f37"
          strokeWidth={stroke}
          strokeDasharray={`${filled} ${circumference - filled}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div style={styles.donutCenter}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{percent}%</div>
        <div style={{ fontSize: 11, color: "#616161" }}>Synced</div>
      </div>
    </div>
  );
}

function TrendChart({ labels, values }: { labels: string[]; values: number[] }) {
  const width = 640;
  const height = 200;
  const padding = 28;
  const max = Math.max(1, ...values);

  const points = values.map((v, i) => {
    const x = padding + (i * (width - padding * 2)) / Math.max(1, values.length - 1);
    const y = height - padding - (v / max) * (height - padding * 2);
    return { x, y };
  });

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible" }}>
      {/* baseline */}
      <line
        x1={padding}
        y1={height - padding}
        x2={width - padding}
        y2={height - padding}
        stroke="#e1e3e5"
      />
      <path d={path} fill="none" stroke="#2c6ecb" strokeWidth={2} />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3.5} fill="#2c6ecb" />
      ))}
      {labels.map((label, i) => (
        <text
          key={label + i}
          x={points[i].x}
          y={height - padding + 16}
          fontSize={11}
          fill="#8c9196"
          textAnchor="middle"
        >
          {label}
        </text>
      ))}
    </svg>
  );
}

function Spinner({ color = "#fff" }: { color?: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 12,
        height: 12,
        marginRight: 6,
        border: `2px solid ${color}66`,
        borderTopColor: color,
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
      }}
    />
  );
}

// ---------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------
function formatStableDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

function timeAgo(date: Date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function formatDuration(startedAt: Date | string, finishedAt: Date | string | null) {
  if (!finishedAt) return "—";
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  const secs = Math.max(0, Math.round(ms / 1000));
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

// ---------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------
const styles: Record<string, React.CSSProperties> = {
  page: {
    background: "#f6f6f7",
    minHeight: "100vh",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    color: "#202223",
  },
  navBar: {
    background: "#ffffff",
    borderBottom: "1px solid #e1e3e5",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 24px",
    height: 56,
  },
  navLeft: { display: "flex", alignItems: "center", gap: 8 },
  logoMark: { color: "#d72c0d", fontWeight: 800, fontSize: 22 },
  logoText: { fontWeight: 600, fontSize: 15 },
  navTabs: { display: "flex", gap: 28, height: "100%" },
  navTab: {
    background: "none",
    border: "none",
    borderBottom: "2px solid transparent",
    padding: "0 4px",
    height: "100%",
    fontSize: 14,
    color: "#616161",
    cursor: "pointer",
  },
  navTabActive: {
    color: "#202223",
    fontWeight: 600,
    borderBottom: "2px solid #d72c0d",
  },
  content: { padding: 24, display: "flex", flexDirection: "column", gap: 20 },
  headerRow: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  pageTitle: { margin: 0, fontSize: 22, fontWeight: 700 },
  pageSubtitle: { margin: "6px 0 0", color: "#616161", fontSize: 14 },
  syncControlsRow: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" },
  darkButton: {
    background: "#1a1a1a",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "10px 18px",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
  },
  outlineButton: {
    background: "#fff",
    color: "#202223",
    border: "1px solid #c9cccf",
    borderRadius: 6,
    padding: "9px 14px",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  },
  outlineButtonLink: {
    background: "#fff",
    color: "#202223",
    border: "1px solid #c9cccf",
    borderRadius: 6,
    padding: "6px 12px",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
  },
  lastSyncedBadge: {
    background: "#e3f6e5",
    color: "#1a7f37",
    borderRadius: 20,
    padding: "6px 14px",
    fontSize: 12,
    fontWeight: 600,
  },
  errorBadge: {
    background: "#fce8e6",
    color: "#d72c0d",
    borderRadius: 20,
    padding: "6px 14px",
    fontSize: 12,
    fontWeight: 600,
  },
  progressPanel: {
    background: "#ffffff",
    border: "1px solid #e1e3e5",
    borderRadius: 10,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  progressHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    fontSize: 13,
    fontWeight: 600,
  },
  progressLabel: {
    color: "#202223",
  },
  progressValue: {
    color: "#1a7f37",
  },
  progressTrack: {
    position: "relative",
    width: "100%",
    height: 10,
    background: "#edf1f2",
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    background: "linear-gradient(90deg, #2f8f5b 0%, #36b37e 100%)",
    transition: "width 220ms ease",
  },
  progressMeta: {
    fontSize: 12,
    color: "#616161",
  },
  statGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 14,
  },
  statCard: {
    background: "#fff",
    border: "1px solid #e1e3e5",
    borderRadius: 10,
    padding: 16,
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 16,
    flexShrink: 0,
  },
  statLabel: { fontSize: 12, color: "#616161", marginBottom: 4 },
  statValue: { fontSize: 22, fontWeight: 700, lineHeight: 1.1 },
  statNote: { fontSize: 11, color: "#8c9196", marginTop: 4 },
  chartsRow: { display: "flex", gap: 16, flexWrap: "wrap" },
  card: {
    background: "#fff",
    border: "1px solid #e1e3e5",
    borderRadius: 10,
    padding: 20,
    flex: 1,
    minWidth: 280,
  },
  cardTitle: { margin: "0 0 16px", fontSize: 15, fontWeight: 700 },
  chartHeader: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  overviewBody: { display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" },
  donutCenter: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    textAlign: "center",
  },
  overviewLegend: { display: "flex", flexDirection: "column", gap: 10, flex: 1 },
  legendRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 13 },
  legendDot: { width: 9, height: 9, borderRadius: "50%", flexShrink: 0 },
  legendLabel: { color: "#616161", flex: 1 },
  legendValue: { fontWeight: 700 },
  tabsRow: { display: "flex", gap: 4, borderBottom: "1px solid #e1e3e5", marginBottom: 16 },
  tableTab: {
    background: "none",
    border: "none",
    borderBottom: "2px solid transparent",
    padding: "8px 4px",
    fontSize: 14,
    color: "#616161",
    cursor: "pointer",
    marginRight: 20,
  },
  tableTabActive: {
    color: "#202223",
    fontWeight: 600,
    borderBottom: "2px solid #d72c0d",
  },
  filterRow: { display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" },
  searchInput: {
    border: "1px solid #c9cccf",
    borderRadius: 6,
    padding: "9px 12px",
    fontSize: 13,
    minWidth: 220,
  },
  filterSelect: {
    border: "1px solid #c9cccf",
    borderRadius: 6,
    padding: "9px 10px",
    fontSize: 13,
    background: "#fff",
    cursor: "pointer",
  },
  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    textAlign: "left",
    background: "#f1f2f3",
    padding: "10px 14px",
    fontSize: 12,
    fontWeight: 600,
    borderTop: "1px solid #e1e3e5",
    borderBottom: "1px solid #e1e3e5",
  },
  tr: { borderBottom: "1px solid #f1f2f3" },
  td: { padding: "12px 14px", fontSize: 13, verticalAlign: "middle" },
  emptyCell: { padding: "36px 14px", textAlign: "center", fontSize: 14, color: "#616161" },
  productCell: { display: "flex", alignItems: "center", gap: 10 },
  productSyncProgress: { display: "flex", alignItems: "center", gap: 8, marginTop: 6, fontSize: 12, color: "#616161" },
  progressBar: { width: 130, height: 7, accentColor: "#1a1a1a" },
  productThumb: { width: 36, height: 36, borderRadius: 6, objectFit: "cover", flexShrink: 0 },
  productThumbPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 6,
    background: "#f1f2f3",
    flexShrink: 0,
  },
  mutedSmall: { fontSize: 11, color: "#8c9196" },
  badge: {
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: 12,
    fontSize: 11,
    fontWeight: 600,
  },
  badgeActive: { background: "#d3f9d8", color: "#1a7f37" },
  badgeDraft: { background: "#f1f2f3", color: "#616161" },
  badgeArchived: { background: "#fce8e6", color: "#d72c0d" },
  paginationRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    paddingTop: 14,
    borderTop: "1px solid #f1f2f3",
  },
  pageButton: {
    border: "1px solid #c9cccf",
    background: "#fff",
    borderRadius: 6,
    width: 30,
    height: 30,
    fontSize: 13,
    cursor: "pointer",
  },
  pageButtonActive: {
    background: "#1a1a1a",
    color: "#fff",
    borderColor: "#1a1a1a",
  },
};