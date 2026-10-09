import { useState, useMemo } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useRevalidator, useSearchParams } from "react-router";

import { authenticate } from "../shopify.server";
import { storeCanUse } from "../models/billing.server";
import { getOfferAnalyticsForOffer, getOfferTrendMetrics } from "../models/offerAnalytics.server";
import { AdminAppLink } from "../components/AdminAppLink";
import db from "../db.server";
import "../styles/analytics.css";

/* ---------------------------------------------------------------------- */
/* Formatters & Helpers                                                   */
/* ---------------------------------------------------------------------- */

function formatRate(value: number | null | undefined) {
  if (value === null || value === undefined || isNaN(value)) return "0.0%";
  return `${(value * 100).toFixed(1)}%`;
}

function formatCompact(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toLocaleString();
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatTrendDate(dateStr: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const day = d.getDate();
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];
  return `${day} ${monthNames[d.getMonth()]}`;
}

function mapRangeToDays(range: string): number {
  return range === "7d" ? 7 : range === "90d" ? 90 : 30;
}

function adjustTrendMetrics(
  source: { labels: string[]; views: number[]; clicks: number[]; addedToCart: number[]; purchases: number[] } | null | undefined,
  days: number,
) {
  if (!source) {
    return {
      labels: Array.from({ length: days }, (_, i) => `Day ${i + 1}`),
      views: Array(days).fill(0),
      clicks: Array(days).fill(0),
      addedToCart: Array(days).fill(0),
      purchases: Array(days).fill(0),
    };
  }

  const takeLastOrPad = (arr: number[] | undefined, targetLen = days) => {
    const a = arr ?? [];
    if (a.length >= targetLen) return a.slice(-targetLen);
    return [...Array(targetLen - a.length).fill(0), ...a];
  };

  const takeLabels = (arr: string[] | undefined, targetLen = days) => {
    const a = arr ?? [];
    if (a.length >= targetLen) return a.slice(-targetLen);
    return [...Array(targetLen - a.length).fill(""), ...a];
  };

  if (days === 90) {
    const raw = {
      labels: takeLabels(source.labels, 90),
      views: takeLastOrPad(source.views, 90),
      clicks: takeLastOrPad(source.clicks, 90),
      addedToCart: takeLastOrPad(source.addedToCart, 90),
      purchases: takeLastOrPad(source.purchases, 90),
    };

    const bucketSize = Math.ceil(90 / 3);
    const sliceArr = (arr: number[]) => {
      const res: number[] = [];
      for (let i = 0; i < 3; i++) {
        const start = Math.max(0, arr.length - 90) + i * bucketSize;
        const end = Math.min(arr.length, start + bucketSize);
        const sum = arr.slice(start, end).reduce((s, v) => s + (v ?? 0), 0);
        res.push(sum);
      }
      return res;
    };

    const monthNames = (n: number) => {
      const now = new Date();
      const labels: string[] = [];
      for (let i = n - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        labels.push(d.toLocaleString("en-US", { month: "short" }));
      }
      return labels;
    };

    return {
      labels: monthNames(3),
      views: sliceArr(raw.views),
      clicks: sliceArr(raw.clicks),
      addedToCart: sliceArr(raw.addedToCart),
      purchases: sliceArr(raw.purchases),
    };
  }

  if (source.labels.length === days) {
    return source;
  }

  let dateLabels = takeLabels(source.labels);
  if (dateLabels.some((l) => !l)) {
    const now = new Date();
    dateLabels = Array.from({ length: days }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (days - 1 - i));
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    });
  }

  return {
    labels: dateLabels,
    views: takeLastOrPad(source.views),
    clicks: takeLastOrPad(source.clicks),
    addedToCart: takeLastOrPad(source.addedToCart),
    purchases: takeLastOrPad(source.purchases),
  };
}

/* ---------------------------------------------------------------------- */
/* Icons                                                                  */
/* ---------------------------------------------------------------------- */


const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const CalendarIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const RefreshIcon = ({ isSpinning }: { isSpinning?: boolean }) => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={isSpinning ? "odSpin" : ""}
  >
    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
  </svg>
);

const EyeIcon = ({ size = 16, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const CursorIcon = ({ size = 16, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
  </svg>
);

const PercentIcon = ({ size = 16, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="5" x2="5" y2="19" />
    <circle cx="6.5" cy="6.5" r="2.5" />
    <circle cx="17.5" cy="17.5" r="2.5" />
  </svg>
);

const CartIcon = ({ size = 16, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="21" r="1" />
    <circle cx="20" cy="21" r="1" />
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
  </svg>
);

const BagIcon = ({ size = 16, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
);

const TrendIcon = ({ size = 16, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
);

const DollarIcon = ({ size = 16, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v12M15 9.5a2.5 2.5 0 0 0-5 0c0 3 5 2 5 5a2.5 2.5 0 0 1-5 0" />
  </svg>
);

const WarningAlertIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const ImagePlaceholderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="3" width="18" height="18" rx="2" stroke="#9ca3af" strokeWidth="1.6" />
    <circle cx="8.5" cy="8.5" r="1.5" fill="#9ca3af" />
    <path d="M21 15l-5-5-9 9" stroke="#9ca3af" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* ---------------------------------------------------------------------- */
/* Trend Chart Series Config                                               */
/* ---------------------------------------------------------------------- */

const TREND_SERIES_CONFIG = [
  { key: "views", label: "Views", color: "#2563eb", dataKey: "views" as const },
  { key: "clicks", label: "Clicks", color: "#9333ea", dataKey: "clicks" as const },
  { key: "addedToCart", label: "Add to Cart", color: "#16a34a", dataKey: "addedToCart" as const },
  { key: "purchases", label: "Purchases", color: "#f59e0b", dataKey: "purchases" as const },
];

function PerformanceChart({
  trendMetrics,
  days = 30,
  onRefresh,
  isRefreshing,
}: {
  trendMetrics: { labels: string[]; views: number[]; clicks: number[]; addedToCart: number[]; purchases: number[] } | null | undefined;
  days?: number;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set(["views", "clicks", "addedToCart", "purchases"]));

  const toggleKey = (key: string) => {
    setActiveKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const width = 640;
  const height = 230;
  const paddingLeft = 36;
  const paddingRight = 16;
  const paddingTop = 18;
  const paddingBottom = 30;

  const rawLabels = trendMetrics?.labels ?? [];
  const points = rawLabels.length > 0 ? rawLabels.length : days;
  const labels =
    rawLabels.length > 0
      ? rawLabels.map(formatTrendDate)
      : Array.from({ length: days }, (_, i) => `Day ${i + 1}`);

  const seriesData = TREND_SERIES_CONFIG.map((s) => ({
    ...s,
    isActive: activeKeys.has(s.key),
    values:
      trendMetrics?.[s.dataKey]?.length === points
        ? trendMetrics[s.dataKey]
        : Array(points).fill(0),
  }));

  const allActiveValues = seriesData.filter((s) => s.isActive).flatMap((s) => s.values);
  const rawMax = allActiveValues.length > 0 ? Math.max(...allActiveValues) : 0;
  const maxValue = rawMax <= 4 ? 4 : Math.max(12, Math.ceil((rawMax * 1.33) / 3) * 3);

  const chartLeft = paddingLeft;
  const chartRight = width - paddingRight;
  const chartWidth = chartRight - chartLeft;
  const chartTop = paddingTop;
  const chartBottom = height - paddingBottom;
  const chartHeight = chartBottom - chartTop;

  function getX(index: number) {
    if (points <= 1) return chartLeft + chartWidth / 2;
    return chartLeft + (index / (points - 1)) * chartWidth;
  }

  function getY(value: number) {
    const t = maxValue > 0 ? value / maxValue : 0;
    return chartBottom - t * chartHeight;
  }

  function getSmoothPath(values: number[]) {
    if (values.length === 0) return "";
    if (values.length === 1) return `M ${getX(0)} ${getY(values[0])}`;
    const pts = values.map((val, idx) => ({ x: getX(idx), y: getY(val) }));
    let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = i > 0 ? pts[i - 1] : pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = i < pts.length - 2 ? pts[i + 2] : p2;

      const tension = 0.2;
      const cp1x = p1.x + (p2.x - p0.x) * tension;
      const cp1y = p1.y + (p2.y - p0.y) * tension;
      const cp2x = p2.x - (p3.x - p1.x) * tension;
      const cp2y = p2.y - (p3.y - p1.y) * tension;

      d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return d;
  }

  function getAreaPath(values: number[]) {
    const line = getSmoothPath(values);
    if (!line) return "";
    return `${line} L ${getX(values.length - 1).toFixed(1)},${chartBottom.toFixed(1)} L ${getX(0).toFixed(1)},${chartBottom.toFixed(1)} Z`;
  }

  const yTicks = [maxValue, Math.round(maxValue * 0.75), Math.round(maxValue * 0.5), Math.round(maxValue * 0.25), 0];

  const xIndices = useMemo(() => {
    if (points <= 7) return Array.from({ length: points }, (_, i) => i);
    const count = 6;
    const indices: number[] = [];
    const step = (points - 1) / (count - 1);
    for (let i = 0; i < count; i++) {
      const idx = Math.round(i * step);
      if (!indices.includes(idx)) {
        indices.push(idx);
      }
    }
    return indices;
  }, [points]);

  const tooltipIdx = hoverIndex;
  const tooltipDate = tooltipIdx !== null ? labels[tooltipIdx] ?? "" : "";
  const plotLeftPct = (chartLeft / width) * 100;
  const plotWidthPct = (chartWidth / width) * 100;
  const hoverPct =
    tooltipIdx !== null && points > 1
      ? plotLeftPct + (tooltipIdx / (points - 1)) * plotWidthPct
      : plotLeftPct + plotWidthPct / 2;
  const tooltipFitsRight = hoverPct < 55;

  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: "12px",
        padding: "20px 22px",
        display: "flex",
        flexDirection: "column",
        flex: "1 1 0%",
        minWidth: 0,
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.03)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "12px",
          marginBottom: "12px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#111827" }}>
            Performance Over Time
          </h3>
          <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#6b7280" }}>
            {days}-day trend across all funnel stages
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {TREND_SERIES_CONFIG.map((s) => {
              const isActive = activeKeys.has(s.key);
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => toggleKey(s.key)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "2px 4px",
                    fontSize: "12px",
                    fontWeight: 500,
                    color: isActive ? "#374151" : "#9ca3af",
                    opacity: isActive ? 1 : 0.45,
                  }}
                  title={isActive ? `Hide ${s.label}` : `Show ${s.label}`}
                >
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: s.color,
                      display: "inline-block",
                    }}
                  />
                  <span>{s.label}</span>
                </button>
              );
            })}
          </div>

          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                border: "1px solid #e5e7eb",
                background: "#ffffff",
                borderRadius: "6px",
                padding: "4px 10px",
                fontSize: "12px",
                fontWeight: 500,
                color: "#4b5563",
                cursor: isRefreshing ? "wait" : "pointer",
              }}
              title="Refresh trends"
            >
              <RefreshIcon isSpinning={isRefreshing} />
              <span>Refresh</span>
            </button>
          ) : null}
        </div>
      </div>

      <div style={{ position: "relative", width: "100%", marginTop: "6px" }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto", overflow: "visible" }}>
          <defs>
            {seriesData.map((s) => (
              <linearGradient key={`grad-${s.key}`} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.14" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0.0" />
              </linearGradient>
            ))}
          </defs>

          {/* Horizontal grid lines & Y labels */}
          {yTicks.map((val, i) => {
            const y = getY(val);
            const isBaseline = val === 0;
            return (
              <g key={`ytick-${val}-${i}`}>
                <line
                  x1={chartLeft}
                  x2={chartRight}
                  y1={y}
                  y2={y}
                  stroke={isBaseline ? "#e5e7eb" : "#f1f5f9"}
                  strokeWidth={isBaseline ? "1.2" : "1"}
                />
                <text
                  x={chartLeft - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fontSize="9.5"
                  fontWeight="500"
                  fill="#94a3b8"
                  fontFamily="-apple-system, sans-serif"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Area gradient fills */}
          {seriesData
            .filter((s) => s.isActive)
            .map((s) => (
              <path
                key={`area-${s.key}`}
                d={getAreaPath(s.values)}
                fill={`url(#grad-${s.key})`}
                pointerEvents="none"
              />
            ))}

          {/* Hover vertical dashed line */}
          {tooltipIdx !== null && (
            <line
              x1={getX(tooltipIdx)}
              x2={getX(tooltipIdx)}
              y1={chartTop}
              y2={chartBottom}
              stroke="#cbd5e1"
              strokeWidth="1.2"
              strokeDasharray="3,3"
            />
          )}

          {/* Series smooth paths */}
          {seriesData
            .filter((s) => s.isActive)
            .map((s) => (
              <path
                key={`path-${s.key}`}
                d={getSmoothPath(s.values)}
                fill="none"
                stroke={s.color}
                strokeWidth="2.4"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}

          {/* Highlight dots on latest active point */}
          {seriesData
            .filter((s) => s.isActive)
            .map((s) => {
              const lastIdx = points - 1;
              const val = s.values[lastIdx] ?? 0;
              return (
                <circle
                  key={`dot-latest-${s.key}`}
                  cx={getX(lastIdx)}
                  cy={getY(val)}
                  r="3.5"
                  fill="#ffffff"
                  stroke={s.color}
                  strokeWidth="2"
                />
              );
            })}

          {/* Hover highlight dots */}
          {tooltipIdx !== null &&
            seriesData
              .filter((s) => s.isActive)
              .map((s) => {
                const val = s.values[tooltipIdx] ?? 0;
                return (
                  <g key={`hover-dot-${s.key}`}>
                    <circle
                      cx={getX(tooltipIdx)}
                      cy={getY(val)}
                      r="6.5"
                      fill={s.color}
                      opacity="0.22"
                    />
                    <circle
                      cx={getX(tooltipIdx)}
                      cy={getY(val)}
                      r="3.8"
                      fill="#ffffff"
                      stroke={s.color}
                      strokeWidth="2.2"
                    />
                  </g>
                );
              })}

          {/* X-axis date labels */}
          {xIndices.map((idx) => {
            const isFirst = idx === 0;
            const isLast = idx === points - 1;
            return (
              <text
                key={`xlabel-${idx}`}
                x={isLast ? chartRight : isFirst ? chartLeft : getX(idx)}
                y={height - 6}
                textAnchor={isLast ? "end" : isFirst ? "start" : "middle"}
                fontSize="9.5"
                fontWeight="500"
                fill="#94a3b8"
                fontFamily="-apple-system, sans-serif"
              >
                {labels[idx] ?? `Day ${idx + 1}`}
              </text>
            );
          })}
        </svg>

        {/* Hover overlay */}
        <div
          style={{
            position: "absolute",
            left: `${plotLeftPct}%`,
            top: `${(chartTop / height) * 100}%`,
            width: `${plotWidthPct}%`,
            height: `${(chartHeight / height) * 100}%`,
            display: "flex",
            cursor: "crosshair",
          }}
          onMouseLeave={() => setHoverIndex(null)}
        >
          {Array.from({ length: points }, (_, i) => (
            <div
              key={`hit-${i}`}
              style={{ flex: 1, height: "100%" }}
              onMouseEnter={() => setHoverIndex(i)}
            />
          ))}
        </div>

        {/* Tooltip Card */}
        {tooltipIdx !== null && (
          <div
            style={{
              position: "absolute",
              top: "8px",
              left: tooltipFitsRight ? `calc(${hoverPct}% + 14px)` : undefined,
              right: tooltipFitsRight ? undefined : `calc(${100 - hoverPct}% + 14px)`,
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "10px",
              padding: "8px 12px",
              fontSize: "12px",
              lineHeight: 1.5,
              pointerEvents: "none",
              boxShadow: "0 8px 20px -4px rgba(0, 0, 0, 0.1)",
              minWidth: "140px",
              zIndex: 20,
            }}
          >
            <div
              style={{
                fontWeight: 700,
                color: "#111827",
                marginBottom: "4px",
                borderBottom: "1px solid #f1f5f9",
                paddingBottom: "3px",
              }}
            >
              {tooltipDate}
            </div>
            {seriesData
              .filter((s) => s.isActive)
              .map((s) => (
                <div
                  key={s.key}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px",
                    marginTop: "2px",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "#4b5563" }}>
                    <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: s.color }} />
                    {s.label}
                  </span>
                  <span style={{ fontWeight: 700, color: "#111827" }}>
                    {(s.values[tooltipIdx] ?? 0).toLocaleString()}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Conversion Funnel Component                                            */
/* ---------------------------------------------------------------------- */

function ConversionFunnelCard({
  funnel,
}: {
  funnel: {
    views: number;
    clicks: number;
    addedToCart: number;
    purchases: number;
    purchaseRate: number | null;
    viewToPurchaseRate?: number | null;
  };
}) {
  const clickToAddedRate = funnel.clicks > 0 ? funnel.addedToCart / funnel.clicks : 0;
  const addedToPurchaseRate = funnel.addedToCart > 0 ? funnel.purchases / funnel.addedToCart : 0;
  const overallRate = funnel.views > 0 ? funnel.purchases / funnel.views : 0;

  // Determine biggest drop-off
  let dropoffLabel = "Add to Cart → Purchase";
  let maxDrop = 0;
  if (funnel.views > 0) {
    const dropViewClick = (funnel.views - funnel.clicks) / funnel.views;
    if (dropViewClick > maxDrop) {
      maxDrop = dropViewClick;
      dropoffLabel = "View → Click";
    }
  }
  if (funnel.clicks > 0) {
    const dropClickAdd = (funnel.clicks - funnel.addedToCart) / funnel.clicks;
    if (dropClickAdd > maxDrop) {
      maxDrop = dropClickAdd;
      dropoffLabel = "Click → Add to Cart";
    }
  }
  if (funnel.addedToCart > 0) {
    const dropAddPurchase = (funnel.addedToCart - funnel.purchases) / funnel.addedToCart;
    if (dropAddPurchase >= maxDrop) {
      maxDrop = dropAddPurchase;
      dropoffLabel = "Add to Cart → Purchase";
    }
  }

  const stages = [
    {
      key: "viewed",
      label: "Viewed",
      value: funnel.views,
      widthPct: "100%",
      bgColor: "#eff6ff",
      borderColor: "#93c5fd",
      textColor: "#0284c7",
      icon: <EyeIcon size={14} color="#0284c7" />,
      rateText: "100.0%",
    },
    {
      key: "clicked",
      label: "Clicked",
      value: funnel.clicks,
      widthPct: "86%",
      bgColor: "#faf5ff",
      borderColor: "#d8b4fe",
      textColor: "#7e22ce",
      icon: <CursorIcon size={14} color="#7e22ce" />,
      rateText: `${(clickToAddedRate * 100).toFixed(1)}%`,
    },
    {
      key: "added",
      label: "Added to Cart",
      value: funnel.addedToCart,
      widthPct: "72%",
      bgColor: "#f0fdf4",
      borderColor: "#86efac",
      textColor: "#15803d",
      icon: <CartIcon size={14} color="#15803d" />,
      rateText: `${(addedToPurchaseRate * 100).toFixed(1)}%`,
    },
    {
      key: "purchased",
      label: "Purchased",
      value: funnel.purchases,
      widthPct: "58%",
      bgColor: "#fffbeb",
      borderColor: "#fde68a",
      textColor: "#b45309",
      icon: <BagIcon size={14} color="#b45309" />,
      rateText: `${(overallRate * 100).toFixed(1)}%`,
    },
  ];

  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: "12px",
        padding: "20px 22px",
        display: "flex",
        flexDirection: "column",
        flex: "0 0 380px",
        minWidth: "320px",
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.03)",
      }}
    >
      <div style={{ marginBottom: "16px" }}>
        <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#111827" }}>
          Conversion Funnel
        </h3>
        <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#6b7280" }}>
          Where customers drop off
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px", flex: 1, justifyContent: "center" }}>
        {stages.map((st) => (
          <div
            key={st.key}
            style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%" }}
          >
            <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
              <div
                style={{
                  position: "relative",
                  width: st.widthPct,
                  height: "36px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  color: st.textColor,
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "default",
                }}
              >
                <svg
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    overflow: "visible",
                  }}
                  viewBox="0 0 100 40"
                  preserveAspectRatio="none"
                >
                  <polygon
                    points="3,1 97,1 92,39 8,39"
                    fill={st.bgColor}
                    stroke={st.borderColor}
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                  />
                </svg>
                <span
                  style={{
                    position: "relative",
                    zIndex: 1,
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  {st.icon}
                  <span>{st.label}</span>
                  <span style={{ fontWeight: 700, marginLeft: "2px" }}>{st.value.toLocaleString()}</span>
                </span>
              </div>
            </div>
            <div
              style={{
                width: "55px",
                fontSize: "12px",
                fontWeight: 600,
                color: "#111827",
                textAlign: "right",
                flexShrink: 0,
              }}
            >
              {st.rateText}
            </div>
          </div>
        ))}

        {/* Drop-off Alert */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#fef2f2",
            border: "1px solid #fee2e2",
            borderRadius: "8px",
            padding: "9px 12px",
            marginTop: "14px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <WarningAlertIcon />
            <span style={{ fontSize: "12px", color: "#dc2626" }}>
              <strong>Biggest drop-off:</strong> {dropoffLabel}
            </span>
          </div>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#dc2626" }}>
            {maxDrop > 0 ? `${(maxDrop * 100).toFixed(0)}%` : "0%"}
          </div>
        </div>

        {/* Overall Conversion Rate Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "1px solid #f1f2f3",
            marginTop: "12px",
            paddingTop: "10px",
          }}
        >
          <span style={{ fontSize: "12px", color: "#6b7280" }}>Overall conversion rate</span>
          <span style={{ fontSize: "13.5px", fontWeight: 700, color: "#16a34a" }}>
            {formatRate(funnel.viewToPurchaseRate ?? funnel.purchaseRate)}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Loader                                                                 */
/* ---------------------------------------------------------------------- */

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  if (!(await storeCanUse(session.shop, "analytics"))) {
    return { analytics: null, locked: true, trendMetrics: null, productNames: {} as Record<string, string>, days: 30 };
  }
  const offerId = params.offerId?.trim();

  if (!session?.shop) {
    return { analytics: null, trendMetrics: null, productNames: {} as Record<string, string>, days: 30 };
  }

  if (!offerId) {
    return { analytics: null, trendMetrics: null, productNames: {} as Record<string, string>, days: 30 };
  }

  const url = new URL(request.url);
  const daysParam = parseInt(url.searchParams.get("days") || "30", 10);
  const days = [7, 30, 90].includes(daysParam) ? daysParam : 30;

  const analytics = await getOfferAnalyticsForOffer(session.shop, offerId);

  if (!analytics) {
    return { analytics: null, trendMetrics: null, productNames: {} as Record<string, string>, days };
  }

  const [trendMetrics] = await Promise.all([
    getOfferTrendMetrics(session.shop, days, { offerIds: [offerId] }),
  ]);

  // Resolve configured product IDs to human-readable names
  const allConfiguredProductIds = analytics.products.map((p) => p.productId);
  const productNames: Record<string, string> = {};
  if (allConfiguredProductIds.length > 0) {
    const rows = await db.productVariant.findMany({
      where: { shop: session.shop, productId: { in: allConfiguredProductIds } },
      select: { productId: true, productTitle: true },
    });
    for (const row of rows) {
      if (row.productTitle) productNames[row.productId] = row.productTitle;
    }
  }

  return { analytics, trendMetrics, productNames, days };
}

/* ---------------------------------------------------------------------- */
/* Offer Details Analytics Page                                           */
/* ---------------------------------------------------------------------- */

export default function OfferAnalyticsDetailsPage() {
  const { analytics, trendMetrics, productNames, locked, days: initialDays } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [searchParams, setSearchParams] = useSearchParams();

  const urlDays = searchParams.get("days");
  const selectedDays = urlDays ? parseInt(urlDays, 10) : initialDays ?? 30;
  const [timeRange, setTimeRange] = useState(
    selectedDays === 7 ? "7d" : selectedDays === 90 ? "90d" : "30d",
  );

  const activeDays = mapRangeToDays(timeRange);

  const currentTrendMetrics = useMemo(() => {
    return adjustTrendMetrics(trendMetrics, activeDays);
  }, [trendMetrics, activeDays]);

  if (locked) {
    return (
      <div className="odPageShell analytics-locked">
        <div className="analytics-locked-blur" aria-hidden="true">
          <div className="odContainer">
            <div className="odHeader">
              <div className="odHeaderLeft">
                <button className="odBackBtn" onClick={() => navigate("/app/analytics")} aria-label="Back">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                </button>
                <div className="odTitleGroup">
                  <h1 className="odTitle">Analytics</h1>
                  <p className="odSubtitle">Offer performance details</p>
                </div>
              </div>
            </div>
            <div className="odSummaryCard">
              <div className="odOfferInfo">
                <h2 className="odOfferName">Offer Analytics</h2>
                <p style={{ color: "#6b7280", fontSize: "13px", margin: 0 }}>View detailed performance metrics for this upsell offer</p>
              </div>
            </div>
            <div className="odMiddleRow">
              <div className="odCard" style={{ flex: 1, minHeight: "300px" }}>
                <div className="odCardHeader">
                  <h3 className="odCardTitle">Performance Over Time</h3>
                </div>
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af" }}>
                  Trend chart preview
                </div>
              </div>
              <div className="odCard" style={{ flex: 1, minHeight: "300px" }}>
                <div className="odCardHeader">
                  <h3 className="odCardTitle">Conversion Funnel</h3>
                </div>
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af" }}>
                  Funnel preview
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="analytics-locked-overlay">
          <div className="analytics-locked-card">
            <h2>Upgrade for the full report</h2>
            <p>Analytics is not included on the Free plan. Silver includes the full report.</p>
            <AdminAppLink to="/app/billing" className="analytics-locked-button">
              View plans
            </AdminAppLink>
          </div>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div
        style={{
          background: "#f8fafc",
          minHeight: "100%",
          padding: "1.5rem",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: "560px",
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            padding: "1.5rem",
            margin: "0 auto",
            textAlign: "center",
          }}
        >
          <h2 style={{ margin: "0 0 0.75rem", fontSize: "1.35rem", color: "#111827" }}>Offer not found</h2>
          <p style={{ margin: "0 0 1rem", color: "#6b7280", lineHeight: 1.5 }}>
            This offer could not be loaded or no longer exists.
          </p>
          <button
            type="button"
            onClick={() => navigate("/app/analytics")}
            style={{
              background: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "0.75rem 1rem",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-block",
            }}
          >
            Back to Analytics
          </button>
        </div>
      </div>
    );
  }

  const { funnel, summary, offer, products, totalRevenue } = analytics;

  // The products array is sorted by performance score; the first product with
  // the highest real performance is the main product.
  const mainProduct =
    products.length > 0
      ? productNames[products[0].productId] ?? products[0].productName ?? products[0].productId
      : null;

  return (
    <div
      style={{
        background: "#f8fafc",
        minHeight: "100vh",
        padding: "20px 28px 40px",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        color: "#111827",
      }}
    >
      <div style={{ maxWidth: "1360px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "18px" }}>

        {/* Back Link */}
        <button
          type="button"
          onClick={() => navigate("/app/analytics")}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            fontSize: "12.5px",
            color: "#4b5563",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            fontWeight: 500,
            width: "fit-content",
          }}
        >
          ← All Upsell Offers
        </button>

        {/* Title & Controls Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 700, color: "#111827" }}>
                {offer.name}
              </h1>
              <button
                type="button"
                title="Copy Offer ID"
                onClick={() => {
                  if (offer.id) {
                    navigator.clipboard?.writeText(offer.id);
                  }
                }}
                style={{
                  background: "none",
                  border: "none",
                  padding: "2px",
                  cursor: "pointer",
                  display: "inline-flex",
                  color: "#6b7280",
                }}
              >
                <CopyIcon />
              </button>
            </div>
            <p style={{ margin: "3px 0 0", fontSize: "13px", color: "#6b7280" }}>
              Upsell offer · {offer.configuredProductCount} product
              {offer.configuredProductCount === 1 ? "" : "s"} configured
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span
              style={{
                background: offer.isActive ? "#dcfce7" : "#f1f5f9",
                color: offer.isActive ? "#15803d" : "#64748b",
                fontSize: "12px",
                fontWeight: 600,
                padding: "3px 12px",
                borderRadius: "999px",
              }}
            >
              {offer.isActive ? "Active" : "Draft"}
            </span>

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: "#ffffff",
                border: "1px solid #d1d5db",
                borderRadius: "8px",
                padding: "6px 12px",
                fontSize: "12.5px",
                fontWeight: 500,
                color: "#374151",
                boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
              }}
            >
              <CalendarIcon />
              <select
                value={timeRange}
                onChange={(e) => {
                  const newRange = e.target.value;
                  setTimeRange(newRange);
                  const targetDays = mapRangeToDays(newRange);
                  setSearchParams(
                    (prev) => {
                      const next = new URLSearchParams(prev);
                      next.set("days", String(targetDays));
                      return next;
                    },
                    { replace: true },
                  );
                }}
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: "12.5px",
                  fontWeight: 500,
                  color: "#374151",
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => void revalidator.revalidate()}
              disabled={revalidator.state === "loading"}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: "#ffffff",
                border: "1px solid #d1d5db",
                borderRadius: "8px",
                padding: "6px 12px",
                fontSize: "12.5px",
                fontWeight: 500,
                color: "#374151",
                boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
                cursor: revalidator.state === "loading" ? "wait" : "pointer",
              }}
            >
              <RefreshIcon isSpinning={revalidator.state === "loading"} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Overall Conversion Rate Banner */}
        <div
          style={{
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: "12px",
            padding: "16px 22px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827" }}>
              Overall Conversion Rate
            </div>
            <div style={{ fontSize: "12px", color: "#059669", marginTop: "3px" }}>
              Impressions → Purchases · Smart ranking uses browse + offer stats
            </div>
          </div>
          <div style={{ fontSize: "32px", fontWeight: 700, color: "#10b981", lineHeight: 1 }}>
            {formatRate(funnel.viewToPurchaseRate ?? funnel.purchaseRate)}
          </div>
        </div>

        {/* 7 KPI Metric Cards Strip */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: "12px",
          }}
        >
          {/* 1. Views */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: "12px",
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              boxShadow: "0 1px 2px rgba(0, 0, 0, 0.02)",
            }}
          >
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "#eff6ff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <EyeIcon size={16} color="#2563eb" />
            </div>
            <div>
              <div style={{ fontSize: "11.5px", color: "#6b7280", fontWeight: 500 }}>Views</div>
              <div style={{ fontSize: "18px", fontWeight: 700, color: "#111827", lineHeight: 1.2 }}>
                {formatCompact(funnel.views)}
              </div>
            </div>
          </div>

          {/* 2. Clicks */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: "12px",
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              boxShadow: "0 1px 2px rgba(0, 0, 0, 0.02)",
            }}
          >
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "#faf5ff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <CursorIcon size={16} color="#9333ea" />
            </div>
            <div>
              <div style={{ fontSize: "11.5px", color: "#6b7280", fontWeight: 500 }}>Clicks</div>
              <div style={{ fontSize: "18px", fontWeight: 700, color: "#111827", lineHeight: 1.2 }}>
                {formatCompact(funnel.clicks)}
              </div>
            </div>
          </div>

          {/* 3. CTR */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: "12px",
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              boxShadow: "0 1px 2px rgba(0, 0, 0, 0.02)",
            }}
          >
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "#f0fdf4",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <PercentIcon size={16} color="#16a34a" />
            </div>
            <div>
              <div style={{ fontSize: "11.5px", color: "#6b7280", fontWeight: 500 }}>CTR</div>
              <div style={{ fontSize: "18px", fontWeight: 700, color: "#111827", lineHeight: 1.2 }}>
                {formatRate(funnel.clickThroughRate)}
              </div>
            </div>
          </div>

          {/* 4. Add to Cart */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: "12px",
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              boxShadow: "0 1px 2px rgba(0, 0, 0, 0.02)",
            }}
          >
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "#fff7ed",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <CartIcon size={16} color="#ea580c" />
            </div>
            <div>
              <div style={{ fontSize: "11.5px", color: "#6b7280", fontWeight: 500 }}>Add to Cart</div>
              <div style={{ fontSize: "18px", fontWeight: 700, color: "#111827", lineHeight: 1.2 }}>
                {formatCompact(funnel.addedToCart)}
              </div>
            </div>
          </div>

          {/* 5. Purchases */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: "12px",
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              boxShadow: "0 1px 2px rgba(0, 0, 0, 0.02)",
            }}
          >
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "#eff6ff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <BagIcon size={16} color="#2563eb" />
            </div>
            <div>
              <div style={{ fontSize: "11.5px", color: "#6b7280", fontWeight: 500 }}>Purchases</div>
              <div style={{ fontSize: "18px", fontWeight: 700, color: "#111827", lineHeight: 1.2 }}>
                {formatCompact(funnel.purchases)}
              </div>
            </div>
          </div>

          {/* 6. View -> Purchase */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: "12px",
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              boxShadow: "0 1px 2px rgba(0, 0, 0, 0.02)",
            }}
          >
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "#f0f4ff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <TrendIcon size={16} color="#4f46e5" />
            </div>
            <div>
              <div style={{ fontSize: "11.5px", color: "#6b7280", fontWeight: 500 }}>View → Purchase</div>
              <div style={{ fontSize: "18px", fontWeight: 700, color: "#111827", lineHeight: 1.2 }}>
                {formatRate(funnel.viewToPurchaseRate)}
              </div>
            </div>
          </div>

          {/* 7. Revenue */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: "12px",
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              boxShadow: "0 1px 2px rgba(0, 0, 0, 0.02)",
            }}
          >
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "#faf5ff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <DollarIcon size={16} color="#9333ea" />
            </div>
            <div>
              <div style={{ fontSize: "11.5px", color: "#6b7280", fontWeight: 500 }}>Revenue</div>
              <div style={{ fontSize: "18px", fontWeight: 700, color: "#111827", lineHeight: 1.2 }}>
                {formatCurrency(totalRevenue)}
              </div>
            </div>
          </div>
        </div>

        {/* Middle Row: Performance Over Time & Conversion Funnel */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.8fr) minmax(340px, 1.15fr)",
            gap: "16px",
            alignItems: "stretch",
          }}
        >
          <PerformanceChart
            trendMetrics={currentTrendMetrics}
            days={activeDays}
            onRefresh={() => void revalidator.revalidate()}
            isRefreshing={revalidator.state === "loading"}
          />
          <ConversionFunnelCard funnel={funnel} />
        </div>

        {/* Offer Details */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            padding: "20px 22px",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.03)",
          }}
        >
          <div style={{ fontSize: "15px", fontWeight: 700, color: "#111827", marginBottom: "16px" }}>
            Offer Details
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: "18px",
            }}
          >
            <div>
              <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "4px" }}>Main Product</div>
              <div style={{ fontSize: "13.5px", fontWeight: 700, color: "#111827" }}>
                {mainProduct ?? "—"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "4px" }}>Upsell Product</div>
              <div style={{ fontSize: "13.5px", fontWeight: 700, color: "#111827" }}>
                {offer.name}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "4px" }}>Status</div>
              <div>
                <span
                  style={{
                    display: "inline-block",
                    background: offer.isActive ? "#dcfce7" : "#f1f5f9",
                    color: offer.isActive ? "#15803d" : "#64748b",
                    fontSize: "11.5px",
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: "999px",
                  }}
                >
                  {offer.isActive ? "Active" : "Draft"}
                </span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "4px" }}>Conversion Rate</div>
              <div style={{ fontSize: "13.5px", fontWeight: 700, color: "#16a34a" }}>
                {formatRate(funnel.purchaseRate)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "4px" }}>Click-through Rate</div>
              <div style={{ fontSize: "13.5px", fontWeight: 700, color: "#111827" }}>
                {formatRate(funnel.clickThroughRate)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "4px" }}>Total Revenue</div>
              <div style={{ fontSize: "13.5px", fontWeight: 700, color: "#111827" }}>
                {formatCurrency(totalRevenue)}
              </div>
            </div>
          </div>
        </div>

        {/* Product Performance Table */}
        <div>
          <div style={{ fontSize: "15px", fontWeight: 700, color: "#111827", marginBottom: "12px" }}>
            Product Performance
          </div>
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: "12px",
              overflow: "hidden",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.03)",
            }}
          >
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                    <th style={{ padding: "10px 16px", fontSize: "12px", fontWeight: 500, color: "#6b7280" }}>Product</th>
                    <th style={{ padding: "10px 16px", fontSize: "12px", fontWeight: 500, color: "#6b7280" }}>Product ID</th>
                    <th style={{ padding: "10px 16px", fontSize: "12px", fontWeight: 500, color: "#6b7280" }}>Views</th>
                    <th style={{ padding: "10px 16px", fontSize: "12px", fontWeight: 500, color: "#6b7280" }}>Clicks</th>
                    <th style={{ padding: "10px 16px", fontSize: "12px", fontWeight: 500, color: "#6b7280" }}>Added to Cart</th>
                    <th style={{ padding: "10px 16px", fontSize: "12px", fontWeight: 500, color: "#6b7280" }}>Purchases</th>
                  </tr>
                </thead>
                <tbody>
                  {products.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: "2rem", textAlign: "center", color: "#6b7280", fontSize: "13px" }}>
                        No product activity for this offer yet.
                      </td>
                    </tr>
                  ) : (
                    products.map((product) => (
                      <tr key={product.productId} style={{ borderBottom: "1px solid #f1f2f3" }}>
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            {product.imageUrl ? (
                              <img
                                src={product.imageUrl}
                                alt={product.productName}
                                style={{
                                  width: "28px",
                                  height: "28px",
                                  borderRadius: "6px",
                                  objectFit: "cover",
                                  border: "1px solid #e5e7eb",
                                  flexShrink: 0,
                                }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: "28px",
                                  height: "28px",
                                  borderRadius: "6px",
                                  background: "#f3f4f6",
                                  border: "1px solid #e5e7eb",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0,
                                }}
                              >
                                <ImagePlaceholderIcon />
                              </div>
                            )}
                            <span style={{ fontSize: "13px", fontWeight: 600, color: "#111827" }}>
                              {product.productName}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: "12px", color: "#6b7280" }}>
                          {product.productId}
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: "13px", color: "#111827" }}>{product.views}</td>
                        <td style={{ padding: "12px 16px", fontSize: "13px", color: "#111827" }}>{product.clicks}</td>
                        <td style={{ padding: "12px 16px", fontSize: "13px", color: "#111827" }}>{product.addedToCart}</td>
                        <td style={{ padding: "12px 16px", fontSize: "13px", color: "#111827" }}>{product.purchases}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
