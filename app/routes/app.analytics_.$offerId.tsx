import { useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";

import { authenticate } from "../shopify.server";
import { getOfferAnalyticsForOffer, getOfferTrendMetrics } from "../models/offerAnalytics.server";
import db from "../db.server";

const colors = {
  border: "#E3E5E7",
  cardBg: "#FFFFFF",
  pageBg: "#F6F6F7",
  text: "#1A1A1A",
  subdued: "#6B7177",
  headBg: "#FAFBFC",
  accent: "#2C6ECB",
  green: "#1A7F37",
  greenBg: "#E9FAF1",
  greenBorder: "#D3F2E0",
  blue: "#2C6ECB",
  orange: "#D97706",
  purple: "#7C3AED",
  red: "#D72C0D",
};

const iconThemes = {
  blue: { bg: "linear-gradient(135deg,#EAF2FF,#D6E7FF)", fg: "#2C6ECB" },
  green: { bg: "linear-gradient(135deg,#E3F6E9,#CDEFD9)", fg: "#28815A" },
  purple: { bg: "linear-gradient(135deg,#F1E9FE,#E4D4FD)", fg: "#7C3AED" },
};

function formatRate(value: number | null) {
  if (value === null) return "—";
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

const EyeIcon = ({ color }: { color: string }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="3" stroke={color} strokeWidth="1.8" />
  </svg>
);

const UserIcon = ({ color }: { color: string }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="8" r="3.5" stroke={color} strokeWidth="1.8" />
    <path d="M4.5 20c1.4-3.5 4.3-5.5 7.5-5.5s6.1 2 7.5 5.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const UsersIcon = ({ color }: { color: string }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <circle cx="9" cy="8" r="3.2" stroke={color} strokeWidth="1.8" />
    <path d="M2.8 19.5c1.2-3.1 3.6-4.9 6.2-4.9s5 1.8 6.2 4.9" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    <path d="M15.5 5.3c1.3.4 2.3 1.6 2.3 3s-1 2.6-2.3 3" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    <path d="M17.5 14.8c1.9.6 3.4 2.1 4.2 4.2" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const ImagePlaceholderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="3" width="18" height="18" rx="2" stroke="#A7ACB1" strokeWidth="1.6" />
    <circle cx="8.5" cy="8.5" r="1.5" fill="#A7ACB1" />
    <path d="M21 15l-5-5-9 9" stroke="#A7ACB1" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* ---------------------------------------------------------------------- */
/* Small building blocks                                                   */
/* ---------------------------------------------------------------------- */

function StatCard({
  icon,
  theme,
  label,
  value,
}: {
  icon: React.ReactNode;
  theme: { bg: string; fg: string };
  label: string;
  value: number | string;
}) {
  return (
    <div
      style={{
        background: colors.cardBg,
        border: `1px solid ${colors.border}`,
        borderRadius: "12px",
        padding: "1rem",
        display: "flex",
        alignItems: "center",
        gap: "0.9rem",
        flex: "1 1 220px",
        minWidth: "220px",
        minHeight: "92px",
      }}
    >
      <div
        style={{
          width: "46px",
          height: "46px",
          borderRadius: "10px",
          background: theme.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.03)",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: "0.83rem", color: colors.subdued, marginBottom: "0.25rem" }}>{label}</div>
        <div style={{ fontSize: "1.6rem", fontWeight: 700, color: colors.text }}>{value}</div>
      </div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>{children}</div>;
}

// Compact stat card used in the top strip (Shown / Views / Clicks / CTR / ...)
function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      style={{
        background: colors.cardBg,
        border: `1px solid ${colors.border}`,
        borderRadius: "10px",
        padding: "0.85rem 1rem",
        flex: "1 1 130px",
        minWidth: "130px",
      }}
    >
      <div
        style={{
          fontSize: "0.68rem",
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: colors.subdued,
          marginBottom: "0.4rem",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: "1.15rem", fontWeight: 700, color: colors.text }}>{value}</div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Performance Over Time — real trend chart with legend toggles            */
/* ---------------------------------------------------------------------- */

const TREND_SERIES_CONFIG: Array<{ key: string; label: string; color: string; dataKey: "views" | "clicks" | "addedToCart" | "purchases" }> = [
  { key: "views", label: "Views", color: "#2C6ECB", dataKey: "views" },
  { key: "clicks", label: "Clicks", color: "#D97706", dataKey: "clicks" },
  { key: "addedToCart", label: "Add to Cart", color: "#7C3AED", dataKey: "addedToCart" },
  { key: "purchases", label: "Purchases", color: "#1A7F37", dataKey: "purchases" },
];

function PerformanceChart({
  trendMetrics,
}: {
  trendMetrics: { labels: string[]; views: number[]; clicks: number[]; addedToCart: number[]; purchases: number[] } | null;
}) {
  const [visible, setVisible] = useState<Record<string, boolean>>(
    Object.fromEntries(TREND_SERIES_CONFIG.map((s) => [s.key, true])),
  );
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const width = 460;
  const height = 220;
  const paddingLeft = 36;
  const paddingRight = 30;
  const paddingBottom = 22;
  const paddingTop = 10;

  const labels = trendMetrics?.labels ?? [];
  const seriesData = TREND_SERIES_CONFIG.map((s) => ({
    ...s,
    values: trendMetrics?.[s.dataKey] ?? [],
  }));

  const allValues = seriesData.flatMap((s) => s.values);
  const maxValue = allValues.length > 0 ? Math.max(...allValues) : 1;
  const points = seriesData[0]?.values.length ?? 0;

  // Determine which label indices to show to avoid crowding
  function getVisibleLabelIndices(count: number): number[] {
    if (count <= 7) return Array.from({ length: count }, (_, i) => i);
    const interval = Math.max(1, Math.floor((count - 1) / 5));
    const result: number[] = [];
    for (let i = 0; i < count; i += interval) result.push(i);
    const lastIdx = count - 1;
    const lastShown = result[result.length - 1];
    if (lastShown !== lastIdx) {
      if (lastIdx - lastShown < interval / 2) {
        result[result.length - 1] = lastIdx;
      } else {
        result.push(lastIdx);
      }
    }
    return result;
  }
  const visibleLabelIndices = getVisibleLabelIndices(points);

  const chartLeft = paddingLeft;
  const chartRight = width - paddingRight;
  const chartWidth = chartRight - chartLeft;
  const chartTop = paddingTop;
  const chartBottom = height - paddingBottom;
  const chartHeight = chartBottom - chartTop;

  if (points === 0) {
    return (
      <div
        style={{
          background: colors.cardBg,
          border: `1px solid ${colors.border}`,
          borderRadius: "12px",
          padding: "1.1rem 1.2rem 1.3rem",
          flex: "3 1 0%",
          minWidth: "0",
        }}
      >
        <div style={{ fontSize: "0.98rem", fontWeight: 700, color: colors.text }}>Performance Over Time</div>
        <div style={{ fontSize: "0.78rem", color: colors.subdued, marginTop: "0.2rem", marginBottom: "0.9rem" }}>
          30-day trend across all funnel stages
        </div>
        <div style={{ textAlign: "center", padding: "2rem", color: colors.subdued, fontSize: "0.85rem" }}>
          No trend data available yet.
        </div>
      </div>
    );
  }

  function toPath(values: number[]) {
    return values
      .map((value, index) => {
        const x = chartLeft + (index / (points - 1)) * chartWidth;
        const y = chartTop + (1 - value / maxValue) * chartHeight;
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }

  function getX(index: number) {
    return chartLeft + (index / (points - 1)) * chartWidth;
  }

  function getY(value: number) {
    return chartTop + (1 - value / maxValue) * chartHeight;
  }

  // Build tooltip data
  const tooltipIdx = hoverIndex;
  const tooltipX = tooltipIdx !== null ? getX(tooltipIdx) : 0;
  const tooltipDate = tooltipIdx !== null ? labels[tooltipIdx] ?? "" : "";
  const tooltipSeries = seriesData.map((s) => ({
    label: s.label,
    color: s.color,
    value: tooltipIdx !== null ? s.values[tooltipIdx] ?? 0 : 0,
  }));

  // Tooltip positioning: flip to left side if near right edge
  const tooltipWidth = 150;
  const tooltipFitsRight = tooltipX + tooltipWidth + 12 < chartRight;
  const tooltipLeft = tooltipFitsRight ? tooltipX + 12 : tooltipX - tooltipWidth - 12;

  return (
    <div
      style={{
        background: colors.cardBg,
        border: `1px solid ${colors.border}`,
        borderRadius: "12px",
        padding: "1.1rem 1.2rem 1.3rem",
        flex: "3 1 0%",
        minWidth: "0",
      }}
    >
      <div style={{ fontSize: "0.98rem", fontWeight: 700, color: colors.text }}>Performance Over Time</div>
      <div style={{ fontSize: "0.78rem", color: colors.subdued, marginTop: "0.2rem", marginBottom: "0.9rem" }}>
        30-day trend across all funnel stages
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
        {seriesData.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setVisible((prev) => ({ ...prev, [s.key]: !prev[s.key] }))}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              background: visible[s.key] ? colors.headBg : "#fff",
              border: `1px solid ${colors.border}`,
              borderRadius: "999px",
              padding: "0.3rem 0.7rem",
              fontSize: "0.72rem",
              fontWeight: 600,
              color: visible[s.key] ? colors.text : colors.subdued,
              cursor: "pointer",
            }}
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: s.color,
                opacity: visible[s.key] ? 1 : 0.35,
              }}
            />
            {s.label}
          </button>
        ))}
      </div>

      <div style={{ position: "relative" }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto" }}>
          {/* Horizontal grid lines */}
          {[0, 0.5, 1].map((fraction) => {
            const y = chartTop + fraction * chartHeight;
            return (
              <line
                key={fraction}
                x1={chartLeft}
                x2={chartRight}
                y1={y}
                y2={y}
                stroke="#EEF0F1"
                strokeWidth={1}
              />
            );
          })}

          {/* Vertical hover line */}
          {tooltipIdx !== null && (
            <line
              x1={getX(tooltipIdx)}
              x2={getX(tooltipIdx)}
              y1={chartTop}
              y2={chartBottom}
              stroke="#C9CCCF"
              strokeWidth={1}
              strokeDasharray="3,3"
            />
          )}

          {/* Series lines */}
          {seriesData.map(
            (s) =>
              visible[s.key] && (
                <path
                  key={s.key}
                  d={toPath(s.values)}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ),
          )}

          {/* Hover dots */}
          {tooltipIdx !== null &&
            seriesData.map(
              (s) =>
                visible[s.key] && (
                  <circle
                    key={`dot-${s.key}`}
                    cx={getX(tooltipIdx)}
                    cy={getY(s.values[tooltipIdx] ?? 0)}
                    r={4}
                    fill="#fff"
                    stroke={s.color}
                    strokeWidth={2}
                  />
                ),
            )}

          {/* X-axis date labels */}
          {visibleLabelIndices.map((idx) => {
            const isFirst = idx === 0;
            const isLast = idx === points - 1;
            return (
              <text
                key={idx}
                x={isLast ? chartRight : isFirst ? chartLeft : getX(idx)}
                y={height - 6}
                textAnchor={isLast ? "end" : isFirst ? "start" : "middle"}
                fontSize="9"
                fill={colors.subdued}
                fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
              >
                {labels[idx]}
              </text>
            );
          })}

          {/* Hover hit areas — one rect per point for easier mouse targeting */}
          {Array.from({ length: points }, (_, i) => (
            <rect
              key={`hit-${i}`}
              x={getX(i) - chartWidth / points / 2}
              y={chartTop}
              width={chartWidth / points}
              height={chartHeight}
              fill="transparent"
              onMouseEnter={() => setHoverIndex(i)}
              onMouseLeave={() => setHoverIndex(null)}
              style={{ cursor: "crosshair" }}
            />
          ))}
        </svg>

        {/* Tooltip */}
        {tooltipIdx !== null && (
          <div
            style={{
              position: "absolute",
              top: chartTop * 2,
              left: tooltipLeft,
              background: "#fff",
              border: `1px solid ${colors.border}`,
              borderRadius: "8px",
              padding: "0.55rem 0.7rem",
              fontSize: "0.7rem",
              lineHeight: 1.55,
              pointerEvents: "none",
              boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
              minWidth: "130px",
              zIndex: 2,
            }}
          >
            <div style={{ fontWeight: 700, color: colors.text, marginBottom: "0.25rem", borderBottom: `1px solid ${colors.border}`, paddingBottom: "0.2rem" }}>
              {tooltipDate}
            </div>
            {tooltipSeries.map((ts) => (
              <div key={ts.label} style={{ display: "flex", justifyContent: "space-between", gap: "0.6rem" }}>
                <span style={{ color: ts.color, fontWeight: 600 }}>{ts.label}</span>
                <span style={{ color: colors.text, fontWeight: 600 }}>{ts.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Conversion Funnel — driven entirely by real analytics data              */
/* ---------------------------------------------------------------------- */
/*
 * FIX vs previous version:
 *  - Added the "Shown" stage (summary.totalViews), which the loader already
 *    returns but the funnel wasn't displaying — matches the reference image,
 *    which shows 5 stages: Shown → Viewed → Clicked → Added to Cart → Purchases.
 *  - Raised the minimum trapezoid width and tightened the label/value type
 *    scale so long labels ("Added to Cart") no longer get clipped at the
 *    narrow end of the funnel.
 */
function ConversionFunnel({
  totalShown,
  funnel,
}: {
  totalShown: number;
  funnel: { views: number; clicks: number; addedToCart: number; purchases: number; purchaseRate: number | null };
}) {
  const stages = [
    { label: "Shown", value: totalShown },
    { label: "Viewed", value: funnel.views },
    { label: "Clicked", value: funnel.clicks },
    { label: "Added to Cart", value: funnel.addedToCart },
    { label: "Purchases", value: funnel.purchases },
  ];
  const maxValue = stages[0].value || 1;
  // Floor rises with each stage so long labels always have room to render
  // on one line, even as the trapezoid narrows toward the bottom.
  const minWidthFloors = [92, 74, 56, 40, 28];

  return (
    <div
      style={{
        background: colors.cardBg,
        border: `1px solid ${colors.border}`,
        borderRadius: "12px",
        padding: "1.1rem 1.2rem 1.3rem",
        flex: "2 1 0%",
        minWidth: "0",
        display: "flex",
        flexDirection: "column",
        minHeight: "380px",
      }}
    >
      <div style={{ fontSize: "0.98rem", fontWeight: 700, color: colors.text }}>Conversion Funnel</div>
      <div style={{ fontSize: "0.78rem", color: colors.subdued, marginTop: "0.2rem", marginBottom: "1rem" }}>
        Where customers drop off
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", flex: 1 }}>
        {stages.map((stage, index) => {
          const widthPct = Math.max(minWidthFloors[index], (stage.value / maxValue) * 100);
          const prev = index > 0 ? stages[index - 1] : null;
          const rawRate = prev && prev.value > 0 ? stage.value / prev.value : null;
          const continuedRate = rawRate === null ? null : Math.min(1, Math.max(0, rawRate));

          return (
            <div key={stage.label}>
              {prev && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    gap: "0.6rem",
                    fontSize: "0.66rem",
                    color: colors.subdued,
                    margin: "0.3rem 0",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span>{continuedRate === null ? "—" : `${(continuedRate * 100).toFixed(0)}% continued`}</span>
                  <span style={{ color: colors.red }}>
                    {continuedRate === null ? "" : `${(100 - continuedRate * 100).toFixed(0)}% dropped`}
                  </span>
                </div>
              )}
              <div
                style={{
                  width: `${widthPct}%`,
                  margin: "0 auto",
                  background: "linear-gradient(135deg,#1A7F37,#28A05C)",
                  clipPath: "polygon(6% 0, 94% 0, 100% 100%, 0% 100%)",
                  color: "#fff",
                  textAlign: "center",
                  padding: "0.65rem 0.4rem",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.1rem",
                }}
              >
                <span style={{ fontSize: "0.74rem", fontWeight: 700, whiteSpace: "nowrap" }}>{stage.label}</span>
                <span style={{ fontSize: "0.7rem", fontWeight: 600, opacity: 0.92, whiteSpace: "nowrap" }}>
                  {formatCompact(stage.value)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderTop: `1px solid ${colors.border}`,
          marginTop: "1rem",
          paddingTop: "0.8rem",
        }}
      >
        <span style={{ fontSize: "0.8rem", color: colors.subdued }}>Overall conversion rate</span>
        <span style={{ fontSize: "1rem", fontWeight: 700, color: colors.green }}>{formatRate(funnel.purchaseRate)}</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Loader (unchanged)                                                      */
/* ---------------------------------------------------------------------- */

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const offerId = params.offerId?.trim();

  if (!session?.shop) {
    return { analytics: null, trendMetrics: null, productNames: {} as Record<string, string> };
  }

  if (!offerId) {
    return { analytics: null, trendMetrics: null, productNames: {} as Record<string, string> };
  }

  const analytics = await getOfferAnalyticsForOffer(session.shop, offerId);

  if (!analytics) {
    return { analytics: null, trendMetrics: null, productNames: {} as Record<string, string> };
  }

  const [trendMetrics] = await Promise.all([
    getOfferTrendMetrics(session.shop, 30, { offerIds: [offerId] }),
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

  return { analytics, trendMetrics, productNames };
}

/* ---------------------------------------------------------------------- */
/* Page                                                                     */
/* ---------------------------------------------------------------------- */

export default function OfferAnalyticsDetailsPage() {
  const navigate = useNavigate();
  const { analytics, trendMetrics, productNames } = useLoaderData<typeof loader>();

  if (!analytics) {
    return (
      <div
        style={{
          background: colors.pageBg,
          minHeight: "100%",
          padding: "1.5rem",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: "560px",
            background: colors.cardBg,
            border: `1px solid ${colors.border}`,
            borderRadius: "12px",
            padding: "1.5rem",
            margin: "0 auto",
            textAlign: "center",
          }}
        >
          <h2 style={{ margin: "0 0 0.75rem", fontSize: "1.35rem", color: colors.text }}>Offer not found</h2>
          <p style={{ margin: "0 0 1rem", color: colors.subdued, lineHeight: 1.5 }}>
            This offer could not be loaded or no longer exists.
          </p>
          <button
            type="button"
            onClick={() => navigate("/app/analytics")}
            style={{
              background: colors.accent,
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "0.75rem 1rem",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
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
  const mainProduct = products.length > 0
    ? (productNames[products[0].productId] ?? products[0].productId)
    : null;

  return (
    <div
      style={{
        background: colors.pageBg,
        minHeight: "100%",
        padding: "1.5rem",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      {/* Back link */}
      <button
        type="button"
        onClick={() => navigate("/app/analytics")}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          marginBottom: "0.75rem",
          fontSize: "0.82rem",
          color: colors.subdued,
          cursor: "pointer",
        }}
      >
        ← All Upsells
      </button>

      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "1rem",
          marginBottom: "1.1rem",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 700, color: colors.text }}>{offer.name}</h1>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: colors.subdued }}>
            {/* Real: number of products configured on this offer. No distinct
                "main product" name is returned by the loader yet. */}
            Upsell offer · {offer.configuredProductCount} product
            {offer.configuredProductCount === 1 ? "" : "s"} configured
          </p>
        </div>
        <span
          style={{
            background: offer.isActive ? "#D3F9D8" : "#F1F2F3",
            color: offer.isActive ? colors.green : colors.subdued,
            fontSize: "0.72rem",
            fontWeight: 700,
            padding: "0.25rem 0.65rem",
            borderRadius: "999px",
            flexShrink: 0,
          }}
        >
          {offer.isActive ? "Active" : "Draft"}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
        {/* Overall conversion rate banner */}
        <div
          style={{
            background: colors.greenBg,
            border: `1px solid ${colors.greenBorder}`,
            borderRadius: "12px",
            padding: "1rem 1.2rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: "0.85rem", fontWeight: 700, color: colors.text }}>Overall Conversion Rate</div>
            <div style={{ fontSize: "0.72rem", color: colors.green, marginTop: "0.15rem" }}>
              Impressions → Purchases · Last 30 days
            </div>
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: colors.green }}>
            {formatRate(funnel.purchaseRate)}
          </div>
        </div>

        {/* Mini stat strip */}
        <Row>
          <MiniStat label="Shown" value={formatCompact(summary.totalViews)} />
          <MiniStat label="Views" value={formatCompact(funnel.views)} />
          <MiniStat label="Clicks" value={formatCompact(funnel.clicks)} />
          <MiniStat label="CTR" value={formatRate(funnel.clickThroughRate)} />
          <MiniStat label="Add to Cart" value={formatCompact(funnel.addedToCart)} />
          <MiniStat label="Purchases" value={formatCompact(funnel.purchases)} />
          <MiniStat label="Revenue" value={formatCurrency(totalRevenue)} />
        </Row>

        {/* Charts row */}
        <div style={{ display: "flex", gap: "1.1rem", flexWrap: "wrap", alignItems: "stretch" }}>
          <PerformanceChart trendMetrics={trendMetrics} />
          <ConversionFunnel totalShown={summary.totalViews} funnel={funnel} />
        </div>

        {/* Offer details */}
        <div
          style={{
            background: colors.cardBg,
            border: `1px solid ${colors.border}`,
            borderRadius: "12px",
            padding: "1.1rem 1.2rem",
          }}
        >
          <div style={{ fontSize: "0.95rem", fontWeight: 700, color: colors.text, marginBottom: "0.9rem" }}>
            Offer Details
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "1.5rem 2.5rem" }}>
            <div>
              <div style={{ fontSize: "0.75rem", color: colors.subdued, marginBottom: "0.2rem" }}>Main Product</div>
              <div style={{ fontSize: "0.9rem", fontWeight: 700, color: colors.text }}>{mainProduct ?? "—"}</div>
            </div>
            <div>
              <div style={{ fontSize: "0.75rem", color: colors.subdued, marginBottom: "0.2rem" }}>Upsell Product</div>
              <div style={{ fontSize: "0.9rem", fontWeight: 700, color: colors.text }}>{offer.name}</div>
            </div>
            <div>
              <div style={{ fontSize: "0.75rem", color: colors.subdued, marginBottom: "0.2rem" }}>Status</div>
              <span
                style={{
                  background: offer.isActive ? "#D3F9D8" : "#F1F2F3",
                  color: offer.isActive ? colors.green : colors.subdued,
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  padding: "0.2rem 0.6rem",
                  borderRadius: "999px",
                }}
              >
                {offer.isActive ? "Active" : "Draft"}
              </span>
            </div>
            <div>
              <div style={{ fontSize: "0.75rem", color: colors.subdued, marginBottom: "0.2rem" }}>Conversion Rate</div>
              <div style={{ fontSize: "0.9rem", fontWeight: 700, color: colors.green }}>
                {formatRate(funnel.purchaseRate)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "0.75rem", color: colors.subdued, marginBottom: "0.2rem" }}>Click-through Rate</div>
              <div style={{ fontSize: "0.9rem", fontWeight: 700, color: colors.text }}>
                {formatRate(funnel.clickThroughRate)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "0.75rem", color: colors.subdued, marginBottom: "0.2rem" }}>Total Revenue</div>
              <div style={{ fontSize: "0.9rem", fontWeight: 700, color: colors.text }}>{formatCurrency(totalRevenue)}</div>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------------
            Kept from the previous version of this page. Not part of the
            reference image, but this real per-product breakdown was existing
            functionality — removing it would lose real data the loader
            already fetches, so it stays as a bonus section below the
            image-matching layout above.
        ------------------------------------------------------------------ */}
        <section>
          <div style={{ fontSize: "0.95rem", fontWeight: 650, color: colors.text, marginBottom: "0.8rem" }}>
            Product performance
          </div>
          <div style={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: "12px", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: colors.headBg }}>
                  <th style={{ textAlign: "left", padding: "0.85rem 1rem", fontSize: "0.76rem", color: colors.subdued }}>Product</th>
                  <th style={{ textAlign: "left", padding: "0.85rem 1rem", fontSize: "0.76rem", color: colors.subdued }}>Product ID</th>
                  <th style={{ textAlign: "left", padding: "0.85rem 1rem", fontSize: "0.76rem", color: colors.subdued }}>Views</th>
                  <th style={{ textAlign: "left", padding: "0.85rem 1rem", fontSize: "0.76rem", color: colors.subdued }}>Clicks</th>
                  <th style={{ textAlign: "left", padding: "0.85rem 1rem", fontSize: "0.76rem", color: colors.subdued }}>Added to Cart</th>
                  <th style={{ textAlign: "left", padding: "0.85rem 1rem", fontSize: "0.76rem", color: colors.subdued }}>Purchases</th>
                </tr>
              </thead>
              <tbody>
                {products.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "1.5rem", color: colors.subdued }}>
                      No product activity for this offer yet.
                    </td>
                  </tr>
                ) : (
                  products.map((product) => (
                    <tr key={product.productId} style={{ borderTop: `1px solid ${colors.border}` }}>
                      <td style={{ padding: "0.8rem 1rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.7rem" }}>
                          {product.imageUrl ? (
                            <img src={product.imageUrl} alt={product.productName} style={{ width: "28px", height: "28px", borderRadius: "6px", objectFit: "cover", border: `1px solid ${colors.border}` }} />
                          ) : (
                            <div style={{ width: "28px", height: "28px", borderRadius: "6px", background: colors.headBg, border: `1px solid ${colors.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <ImagePlaceholderIcon />
                            </div>
                          )}
                          <span style={{ fontWeight: 600 }}>{product.productName}</span>
                        </div>
                      </td>
                      <td style={{ padding: "0.8rem 1rem", color: colors.subdued, wordBreak: "break-all" }}>{product.productId}</td>
                      <td style={{ padding: "0.8rem 1rem" }}>{product.views}</td>
                      <td style={{ padding: "0.8rem 1rem" }}>{product.clicks}</td>
                      <td style={{ padding: "0.8rem 1rem" }}>{product.addedToCart}</td>
                      <td style={{ padding: "0.8rem 1rem" }}>{product.purchases}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ------------------------------------------------------------------
            The original "Offer information" and icon-based "Views" cards are
            superseded by the mini stat strip and Offer Details card above —
            same real data (offer.name, offer.configuredProductCount,
            summary.totalViews, summary.uniqueLoggedInUsers/uniqueGuestUsers),
            just re-laid-out to match the reference image. Left here,
            commented, in case you want the unique-visitor breakdown back:

        <section>
          <div style={{ fontSize: "0.95rem", fontWeight: 650, color: colors.text, marginBottom: "0.8rem" }}>Views</div>
          <Row>
            <StatCard icon={<EyeIcon color={iconThemes.blue.fg} />} theme={iconThemes.blue} label="Total views" value={summary.totalViews} />
            <StatCard icon={<UserIcon color={iconThemes.green.fg} />} theme={iconThemes.green} label="Unique logged-in users" value={summary.uniqueLoggedInUsers} />
            <StatCard icon={<UsersIcon color={iconThemes.purple.fg} />} theme={iconThemes.purple} label="Unique guest users" value={summary.uniqueGuestUsers} />
          </Row>
        </section>
        */}
      </div>
    </div>
  );
}