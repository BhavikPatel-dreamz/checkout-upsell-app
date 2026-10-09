import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router";
import { AdminAppLink } from "../AdminAppLink";

/* ---------------------------------------------------------------------- */
/* Types                                                                  */
/* ---------------------------------------------------------------------- */

type ProductMetaMap = {
  titles: Record<string, string>;
  images: Record<string, string>;
};

type AnalyticsDashboardProps = {
  viewMetrics: {
    totalViews: number;
    uniqueLoggedInUsers: number;
    uniqueGuestUsers: number;
    offerBreakdown: Array<{ offerId: string; offerName: string; views: number }>;
    productBreakdown: Array<{ productId: string; views: number }>;
  };
  clickMetrics: {
    totalClicks: number;
    offerBreakdown: Array<{ offerId: string; offerName: string; clicks: number }>;
    productBreakdown: Array<{ productId: string; clicks: number }>;
  };
  addedToCartMetrics: {
    totalAddedToCart: number;
    offerBreakdown: Array<{ offerId: string; offerName: string; addedToCart: number }>;
    productBreakdown: Array<{ productId: string; addedToCart: number }>;
  };
  purchaseMetrics: {
    totalPurchases: number;
    totalRevenue: number;
    offerBreakdown: Array<{ offerId: string; offerName: string; purchases: number }>;
    productBreakdown: Array<{ productId: string; purchases: number }>;
  };
  trendMetrics?: {
    labels: string[];
    views: number[];
    clicks: number[];
    addedToCart: number[];
    purchases: number[];
  };
  productMetaMap: ProductMetaMap;
  funnelRates?: {
    viewToClick: number | null;
    clickToAddedToCart: number | null;
    addedToCartToPurchase: number | null;
    viewToPurchase: number | null;
  };
  browseToOffer?: {
    browseIdentities: number;
    offerViewIdentities: number;
    overlap: number;
    browseToOfferRate: number | null;
  };
  offerDetailUrl: (offerId: string) => string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
};

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

function formatProductId(id: string): string {
  if (!id) return "—";
  const num = id.replace(/\D/g, "");
  if (num) {
    return `#EP-${num.slice(-3).padStart(3, "0")}`;
  }
  return id;
}

/* ---------------------------------------------------------------------- */
/* Vector Icons (identical to Offer Details Page)                         */
/* ---------------------------------------------------------------------- */

const CalendarIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);



const EyeIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const CursorIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
  </svg>
);

const CartIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="21" r="1" />
    <circle cx="20" cy="21" r="1" />
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
  </svg>
);

const BagIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
);

const PercentIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="5" x2="5" y2="19" />
    <circle cx="6.5" cy="6.5" r="2.5" />
    <circle cx="17.5" cy="17.5" r="2.5" />
  </svg>
);

const DollarIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v12M15 9.5a2.5 2.5 0 0 0-5 0c0 3 5 2 5 5a2.5 2.5 0 0 1-5 0" />
  </svg>
);

const WarningAlertIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const SearchIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
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

/* ---------------------------------------------------------------------- */
/* Performance Trend Chart                                                */
/* ---------------------------------------------------------------------- */

const TREND_SERIES = [
  { key: "views", label: "Views", color: "#3b82f6", dataKey: "views" as const },
  { key: "clicks", label: "Clicks", color: "#a855f7", dataKey: "clicks" as const },
  { key: "addedToCart", label: "Add to Cart", color: "#22c55e", dataKey: "addedToCart" as const },
  { key: "purchases", label: "Purchases", color: "#f59e0b", dataKey: "purchases" as const },
];

function PerformanceChart({
  trendMetrics,
  onRefresh,
  isRefreshing,
}: {
  trendMetrics: { labels: string[]; views: number[]; clicks: number[]; addedToCart: number[]; purchases: number[] } | null | undefined;
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

  const width = 680;
  const height = 250;
  const paddingLeft = 38;
  const paddingRight = 18;
  const paddingTop = 22;
  const paddingBottom = 34;

  const rawLabels = trendMetrics?.labels ?? [];
  const points = rawLabels.length > 0 ? rawLabels.length : 15;
  const labels =
    rawLabels.length > 0
      ? rawLabels
      : Array.from({ length: 15 }, (_, i) => `Day ${i + 1}`);

  const seriesData = TREND_SERIES.map((s) => ({
    ...s,
    isActive: activeKeys.has(s.key),
    values: trendMetrics?.[s.dataKey]?.length === points
      ? trendMetrics[s.dataKey]
      : Array(points).fill(0),
  }));

  const allActiveValues = seriesData
    .filter((s) => s.isActive)
    .flatMap((s) => s.values);
  const rawMax = allActiveValues.length > 0 ? Math.max(...allActiveValues) : 0;
  const maxValue = rawMax <= 4 ? 4 : Math.ceil(rawMax * 1.25);

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
    <div className="odCard" style={{ flex: 1, minWidth: 0 }}>
      <div className="odCardHeader">
        <h3 className="odCardTitle">Performance Trend</h3>
        <div className="odTrendLegend">
          {TREND_SERIES.map((s) => {
            const isActive = activeKeys.has(s.key);
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => toggleKey(s.key)}
                className="odLegendItem"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "2px 4px",
                  borderRadius: "4px",
                  opacity: isActive ? 1 : 0.4,
                  transition: "opacity 0.15s ease",
                }}
                title={isActive ? `Hide ${s.label}` : `Show ${s.label}`}
              >
                <span className="odLegendDot" style={{ background: s.color }} />
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
            className="odViewDetailsBtn"
            title="Refresh trends"
          >
            <RefreshIcon isSpinning={isRefreshing} />
            <span>{isRefreshing ? "Refreshing..." : "Refresh"}</span>
          </button>
        ) : (
          <span className="odViewDetailsBtn" style={{ cursor: "default" }}>
            Overview
          </span>
        )}
      </div>

      <div style={{ position: "relative", width: "100%", marginTop: "6px" }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto", overflow: "visible" }}>
          <defs>
            {seriesData.map((s) => (
              <linearGradient key={`grad-${s.key}`} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.12" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0.0" />
              </linearGradient>
            ))}
          </defs>

          {/* Horizontal gridlines & Y labels */}
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
                  stroke={isBaseline ? "#e2e8f0" : "#f1f5f9"}
                  strokeWidth={isBaseline ? "1.2" : "1"}
                  strokeDasharray={isBaseline ? undefined : "3 3"}
                />
                <text
                  x={chartLeft - 10}
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
                strokeWidth="2.2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}

          {/* Non-zero dots on paths (avoids cluttering the zero baseline) */}
          {seriesData
            .filter((s) => s.isActive)
            .map((s) =>
              s.values.map((val, idx) => {
                if (val === 0 && points > 7) return null;
                if (idx === tooltipIdx) return null;
                return (
                  <circle
                    key={`dot-${s.key}-${idx}`}
                    cx={getX(idx)}
                    cy={getY(val)}
                    r="2.8"
                    fill="#ffffff"
                    stroke={s.color}
                    strokeWidth="1.6"
                  />
                );
              })
            )}

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
                y={height - 8}
                textAnchor={isLast ? "end" : isFirst ? "start" : "middle"}
                fontSize="9.5"
                fontWeight="500"
                fill="#94a3b8"
                fontFamily="-apple-system, sans-serif"
              >
                {labels[idx]}
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
              padding: "10px 14px",
              fontSize: "12px",
              lineHeight: 1.6,
              pointerEvents: "none",
              boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
              minWidth: "150px",
              zIndex: 20,
              transition: "left 0.1s ease, right 0.1s ease",
            }}
          >
            <div
              style={{
                fontWeight: 700,
                color: "#111827",
                marginBottom: "6px",
                borderBottom: "1px solid #f1f5f9",
                paddingBottom: "4px",
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
                    gap: "14px",
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
/* Conversion Funnel Card                                                 */
/* ---------------------------------------------------------------------- */

function ConversionFunnelCard({
  funnel,
  browseToOffer,
}: {
  funnel: {
    views: number;
    clicks: number;
    addedToCart: number;
    purchases: number;
  };
  browseToOffer?: {
    browseIdentities: number;
    offerViewIdentities: number;
    overlap: number;
    browseToOfferRate: number | null;
  };
}) {
  const viewToClickRate = funnel.views > 0 ? funnel.clicks / funnel.views : 0;
  const clickToAddedRate = funnel.clicks > 0 ? funnel.addedToCart / funnel.clicks : 0;
  const addedToPurchaseRate = funnel.addedToCart > 0 ? funnel.purchases / funnel.addedToCart : 0;
  const overallRate = funnel.views > 0 ? funnel.purchases / funnel.views : 0;

  // Determine biggest drop-off
  let dropoffLabel = "View → Click";
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
    if (dropAddPurchase > maxDrop) {
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
      bgColor: "#e0f2fe",
      borderColor: "#bae6fd",
      textColor: "#0369a1",
      icon: <EyeIcon size={14} />,
      rateText: `→ ${(viewToClickRate * 100).toFixed(1)}%`,
    },
    {
      key: "clicked",
      label: "Clicked",
      value: funnel.clicks,
      widthPct: "86%",
      bgColor: "#f3e8ff",
      borderColor: "#e9d5ff",
      textColor: "#7e22ce",
      icon: <CursorIcon size={14} />,
      rateText: `→ ${(clickToAddedRate * 100).toFixed(1)}%`,
    },
    {
      key: "added",
      label: "Added to Cart",
      value: funnel.addedToCart,
      widthPct: "72%",
      bgColor: "#dcfce7",
      borderColor: "#bbf7d0",
      textColor: "#15803d",
      icon: <CartIcon size={14} />,
      rateText: `→ ${(addedToPurchaseRate * 100).toFixed(1)}%`,
    },
    {
      key: "purchased",
      label: "Purchased",
      value: funnel.purchases,
      widthPct: "58%",
      bgColor: "#fef3c7",
      borderColor: "#fde68a",
      textColor: "#b45309",
      icon: <BagIcon size={14} />,
      rateText: `${(overallRate * 100).toFixed(1)}%`,
    },
  ];

  return (
    <div className="odCard" style={{ flex: "0 0 380px", minWidth: "320px" }}>
      <div className="odCardHeader">
        <h3 className="odCardTitle">Conversion Funnel</h3>
      </div>

      <div className="odFunnelContainer">
        {stages.map((st) => (
          <div key={st.key} className="odFunnelRow">
            <div className="odFunnelBarWrap">
              <div
                style={{
                  position: "relative",
                  width: st.widthPct,
                  height: "38px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  color: st.textColor,
                  fontSize: "12.5px",
                  fontWeight: 600,
                  transition: "transform 0.15s ease",
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
                <span style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: "6px" }}>
                  {st.icon}
                  <span>{st.label}</span>
                  <span style={{ fontWeight: 700, marginLeft: "4px" }}>{st.value.toLocaleString()}</span>
                </span>
              </div>
            </div>
            <div className="odFunnelRate">{st.rateText}</div>
          </div>
        ))}

        <div className="odDropoffAlert">
          <div className="odDropoffLeft">
            <span className="odDropoffIcon">
              <WarningAlertIcon />
            </span>
            <div>
              <span className="odDropoffTitle">Biggest drop-off: </span>
              <span className="odDropoffSubtitle">{dropoffLabel}</span>
            </div>
          </div>
          <div className="odDropoffValue">
            {maxDrop > 0 ? `${(maxDrop * 100).toFixed(0)}%` : "—"}
          </div>
        </div>

        {browseToOffer ? (
          <div
            style={{
              marginTop: "8px",
              paddingTop: "10px",
              borderTop: "1px solid #f1f5f9",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "12px",
              color: "#6b7280",
            }}
          >
            <span>Browse → Offer View</span>
            <span style={{ fontWeight: 600, color: "#111827" }}>
              {formatRate(browseToOffer.browseToOfferRate)}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Main Analytics Dashboard Component                                     */
/* ---------------------------------------------------------------------- */

export default function AnalyticsDashboard({
  viewMetrics: initViewMetrics,
  clickMetrics: initClickMetrics,
  addedToCartMetrics: initAddedToCartMetrics,
  purchaseMetrics: initPurchaseMetrics,
  trendMetrics: initTrendMetrics,
  productMetaMap: initProductMetaMap,
  funnelRates: initFunnelRates,
  browseToOffer: initBrowseToOffer,
  offerDetailUrl,
  onRefresh,
  isRefreshing = false,
}: AnalyticsDashboardProps) {
  const navigate = useNavigate();
  const [timeRangeFilter, setTimeRangeFilter] = useState("30d");
  const [tableMode, setTableMode] = useState<"offers" | "products">("offers");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("purchases");

  const [viewMetrics, setViewMetrics] = useState(initViewMetrics);
  const [clickMetrics, setClickMetrics] = useState(initClickMetrics);
  const [addedToCartMetrics, setAddedToCartMetrics] = useState(initAddedToCartMetrics);
  const [purchaseMetrics, setPurchaseMetrics] = useState(initPurchaseMetrics);
  const [productMetaMap, setProductMetaMap] = useState(initProductMetaMap);
  const [browseToOffer, setBrowseToOffer] = useState(initBrowseToOffer);
  const [funnelRates, setFunnelRates] = useState(initFunnelRates);
  const [localTrendMetrics, setLocalTrendMetrics] = useState(initTrendMetrics);

  const totalViews = viewMetrics.totalViews;
  const totalClicks = clickMetrics.totalClicks;
  const totalAddedToCart = addedToCartMetrics.totalAddedToCart;
  const totalPurchases = purchaseMetrics.totalPurchases;
  const totalRevenue = purchaseMetrics.totalRevenue ?? 0;
  const conversionRate = totalViews > 0 ? totalPurchases / totalViews : null;

  const mapRangeToDays = (r: string) => (r === "7d" ? 7 : r === "30d" ? 30 : r === "90d" ? 90 : 30);

  const adjustTrendMetrics = (
    source: typeof initTrendMetrics | undefined,
    days: number,
  ): typeof initTrendMetrics => {
    const empty = (n: number) => Array.from({ length: n }, () => 0);
    const labelsEmpty = (n: number) => Array.from({ length: n }, (_, i) => `D${i + 1}`);
    if (!source) {
      return {
        labels: labelsEmpty(days),
        views: empty(days),
        clicks: empty(days),
        addedToCart: empty(days),
        purchases: empty(days),
      };
    }

    const takeLastOrPad = (arr: number[] | undefined) => {
      const a = arr ?? [];
      if (a.length >= days) return a.slice(-days);
      return [...Array(days - a.length).fill(0), ...a];
    };

    const takeLabels = (arr: string[] | undefined) => {
      const a = arr ?? [];
      if (a.length >= days) return a.slice(-days);
      return [...Array(days - a.length).fill(""), ...a];
    };

    if (days === 90) {
      const raw = {
        labels: takeLabels(source.labels),
        views: takeLastOrPad(source.views),
        clicks: takeLastOrPad(source.clicks),
        addedToCart: takeLastOrPad(source.addedToCart),
        purchases: takeLastOrPad(source.purchases),
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
          labels.push(d.toLocaleString(undefined, { month: "short" }));
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

    if (days === 7 || days === 30) {
      const dateLabels = (n: number) => {
        const arr: string[] = [];
        for (let i = n - 1; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          arr.push(d.toLocaleDateString(undefined, { month: "short", day: "numeric" }));
        }
        return arr;
      };

      return {
        labels: dateLabels(days),
        views: takeLastOrPad(source.views),
        clicks: takeLastOrPad(source.clicks),
        addedToCart: takeLastOrPad(source.addedToCart),
        purchases: takeLastOrPad(source.purchases),
      };
    }

    return {
      labels: takeLabels(source.labels),
      views: takeLastOrPad(source.views),
      clicks: takeLastOrPad(source.clicks),
      addedToCart: takeLastOrPad(source.addedToCart),
      purchases: takeLastOrPad(source.purchases),
    };
  };

  useEffect(() => {
    const days = mapRangeToDays(timeRangeFilter);
    let cancelled = false;

    (async () => {
      try {
        const params = new URLSearchParams({ days: String(days), status: "all" });
        const res = await fetch(`/api/analytics/dashboard?${params.toString()}`, { credentials: "same-origin" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          if (data.viewMetrics) setViewMetrics(data.viewMetrics);
          if (data.clickMetrics) setClickMetrics(data.clickMetrics);
          if (data.addedToCartMetrics) setAddedToCartMetrics(data.addedToCartMetrics);
          if (data.purchaseMetrics) setPurchaseMetrics(data.purchaseMetrics);
          if (data.trendMetrics) setLocalTrendMetrics(data.trendMetrics);
          if (data.productMetaMap) setProductMetaMap(data.productMetaMap);
          if (data.funnelRates) setFunnelRates(data.funnelRates);
          if (data.browseToOffer) setBrowseToOffer(data.browseToOffer);
        }
      } catch {
        // ignore fetch errors; keep existing
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [timeRangeFilter]);

  useEffect(() => {
    const days = mapRangeToDays(timeRangeFilter);
    setLocalTrendMetrics((prev) => adjustTrendMetrics(prev ?? initTrendMetrics, days));
  }, [timeRangeFilter, initTrendMetrics]);

  /* -------------------------------------------------------------------- */
  /* Offers breakdown list for bottom card                                */
  /* -------------------------------------------------------------------- */

  const offersList = useMemo(() => {
    const offerIdToClicks = Object.fromEntries(clickMetrics.offerBreakdown.map((row) => [row.offerId, row.clicks]));
    const offerIdToViews = Object.fromEntries(viewMetrics.offerBreakdown.map((row) => [row.offerId, row.views]));
    const offerIdToPurchases = Object.fromEntries(purchaseMetrics.offerBreakdown.map((row) => [row.offerId, row.purchases]));
    const offerIdToAdded = Object.fromEntries(addedToCartMetrics.offerBreakdown.map((row) => [row.offerId, row.addedToCart]));

    const allOfferIds = new Set([
      ...viewMetrics.offerBreakdown.map((r) => r.offerId),
      ...clickMetrics.offerBreakdown.map((r) => r.offerId),
      ...addedToCartMetrics.offerBreakdown.map((r) => r.offerId),
      ...purchaseMetrics.offerBreakdown.map((r) => r.offerId),
    ]);

    const offerIdToName = new Map<string, string>();
    for (const row of viewMetrics.offerBreakdown) offerIdToName.set(row.offerId, row.offerName);
    for (const row of clickMetrics.offerBreakdown) offerIdToName.set(row.offerId, row.offerName);
    for (const row of addedToCartMetrics.offerBreakdown) offerIdToName.set(row.offerId, row.offerName);
    for (const row of purchaseMetrics.offerBreakdown) offerIdToName.set(row.offerId, row.offerName);

    return Array.from(allOfferIds).map((offerId) => {
      const views = offerIdToViews[offerId] ?? 0;
      const clicks = offerIdToClicks[offerId] ?? 0;
      const addedToCart = offerIdToAdded[offerId] ?? 0;
      const purchases = offerIdToPurchases[offerId] ?? 0;
      const ctr = views > 0 ? (clicks / views) * 100 : 0;
      const convRate = views > 0 ? (purchases / views) * 100 : 0;
      const revenue = totalPurchases > 0 ? (totalRevenue / totalPurchases) * purchases : 0;

      return {
        offerId,
        offerName: offerIdToName.get(offerId) || `Offer ${offerId.slice(-6)}`,
        views,
        clicks,
        addedToCart,
        purchases,
        ctr,
        convRate,
        revenue,
      };
    });
  }, [clickMetrics, viewMetrics, purchaseMetrics, addedToCartMetrics, totalPurchases, totalRevenue]);

  /* -------------------------------------------------------------------- */
  /* Products breakdown list for bottom card                              */
  /* -------------------------------------------------------------------- */

  const productsList = useMemo(() => {
    const prodIdToClicks = Object.fromEntries(clickMetrics.productBreakdown.map((row) => [row.productId, row.clicks]));
    const prodIdToViews = Object.fromEntries(viewMetrics.productBreakdown.map((row) => [row.productId, row.views]));
    const prodIdToPurchases = Object.fromEntries(purchaseMetrics.productBreakdown.map((row) => [row.productId, row.purchases]));
    const prodIdToAdded = Object.fromEntries(addedToCartMetrics.productBreakdown.map((row) => [row.productId, row.addedToCart]));

    const allProductIds = new Set([
      ...viewMetrics.productBreakdown.map((r) => r.productId),
      ...clickMetrics.productBreakdown.map((r) => r.productId),
      ...addedToCartMetrics.productBreakdown.map((r) => r.productId),
      ...purchaseMetrics.productBreakdown.map((r) => r.productId),
    ]);

    return Array.from(allProductIds).map((productId) => {
      const views = prodIdToViews[productId] ?? 0;
      const clicks = prodIdToClicks[productId] ?? 0;
      const addedToCart = prodIdToAdded[productId] ?? 0;
      const purchases = prodIdToPurchases[productId] ?? 0;
      const ctr = views > 0 ? (clicks / views) * 100 : 0;
      const convRate = views > 0 ? (purchases / views) * 100 : 0;
      const revenue = totalPurchases > 0 ? (totalRevenue / totalPurchases) * purchases : 0;

      return {
        productId,
        productName: productMetaMap.titles[productId] || productId,
        views,
        clicks,
        addedToCart,
        purchases,
        ctr,
        convRate,
        revenue,
      };
    });
  }, [clickMetrics, viewMetrics, purchaseMetrics, addedToCartMetrics, productMetaMap, totalPurchases, totalRevenue]);

  /* -------------------------------------------------------------------- */
  /* Filter & Sort for Table                                              */
  /* -------------------------------------------------------------------- */

  const filteredOffers = useMemo(() => {
    let list = [...offersList];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (o) =>
          o.offerName.toLowerCase().includes(q) ||
          o.offerId.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      switch (sortKey) {
        case "purchases":
          return b.purchases - a.purchases;
        case "views":
          return b.views - a.views;
        case "clicks":
          return b.clicks - a.clicks;
        case "revenue":
          return b.revenue - a.revenue;
        case "conversion":
          return b.convRate - a.convRate;
        default:
          return 0;
      }
    });
    return list;
  }, [offersList, search, sortKey]);

  const filteredProducts = useMemo(() => {
    let list = [...productsList];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.productName.toLowerCase().includes(q) ||
          p.productId.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      switch (sortKey) {
        case "purchases":
          return b.purchases - a.purchases;
        case "views":
          return b.views - a.views;
        case "clicks":
          return b.clicks - a.clicks;
        case "revenue":
          return b.revenue - a.revenue;
        case "conversion":
          return b.convRate - a.convRate;
        default:
          return 0;
      }
    });
    return list;
  }, [productsList, search, sortKey]);

  const funnel = {
    views: totalViews,
    clicks: totalClicks,
    addedToCart: totalAddedToCart,
    purchases: totalPurchases,
  };

  return (
    <div className="odPageShell">
      <div className="odContainer">
        {/* Top Header */}
        <div className="odHeader">
          <div className="odHeaderLeft">
            <div className="odTitleGroup">
              <h1 className="odTitle">Upsell Analytics</h1>
              <p className="odSubtitle">
                Smart ranking reorders eligible offers from browse activity and offer conversion
              </p>
            </div>
          </div>
          <div className="odHeaderRight">
            <div className="odDateSelect">
              <CalendarIcon />
              <select
                value={timeRangeFilter}
                onChange={(event) => setTimeRangeFilter(event.target.value)}
              >
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
              </select>
            </div>
            {onRefresh ? (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="odViewDetailsBtn"
                title="Refresh dashboard metrics"
                style={{ cursor: isRefreshing ? "wait" : "pointer" }}
              >
                <RefreshIcon isSpinning={isRefreshing} />
                <span>{isRefreshing ? "Refreshing..." : "Refresh"}</span>
              </button>
            ) : null}
          </div>
        </div>

        {/* Top Summary Banner Card */}
        <div className="odSummaryCard">
          <div className="odOfferInfo">
            <h2 className="odOfferName">All Upsell Offers</h2>
            <div className="odAppliesTo">
              <span>Smart ranking from browse & conversion</span>
            </div>
          </div>

          <div className="odMetricsGrid">
            <div className="odMetricCol">
              <div className="odMetricLabel">
                <EyeIcon size={14} />
                <span>Total Views</span>
              </div>
              <div className="odMetricValue">{totalViews.toLocaleString()}</div>
            </div>
            <div className="odMetricCol">
              <div className="odMetricLabel">
                <CursorIcon size={14} />
                <span>Clicks</span>
              </div>
              <div className="odMetricValue">{totalClicks.toLocaleString()}</div>
            </div>
            <div className="odMetricCol">
              <div className="odMetricLabel">
                <CartIcon size={14} />
                <span>Add to Cart</span>
              </div>
              <div className="odMetricValue">{totalAddedToCart.toLocaleString()}</div>
            </div>
            <div className="odMetricCol">
              <div className="odMetricLabel">
                <BagIcon size={14} />
                <span>Purchases</span>
              </div>
              <div className="odMetricValue">{totalPurchases.toLocaleString()}</div>
            </div>
            <div className="odMetricCol">
              <div className="odMetricLabel">
                <PercentIcon size={14} />
                <span>Conversion Rate</span>
              </div>
              <div className="odMetricValue">{formatRate(conversionRate)}</div>
            </div>
            <div className="odMetricCol">
              <div className="odMetricLabel">
                <DollarIcon size={14} />
                <span>Revenue</span>
              </div>
              <div className="odMetricValue">{formatCurrency(totalRevenue)}</div>
            </div>
          </div>
        </div>

        {/* Middle Row: Trend & Funnel */}
        <div className="odMiddleRow">
          <PerformanceChart
            trendMetrics={localTrendMetrics}
            onRefresh={onRefresh}
            isRefreshing={isRefreshing}
          />
          <ConversionFunnelCard funnel={funnel} browseToOffer={browseToOffer} />
        </div>

        {/* Bottom Card: Offer / Product Performance */}
        <div className="odBottomCard">
          <div className="odCardHeader">
            <div>
              <h3 className="odCardTitle">
                {tableMode === "offers" ? "Offer Performance" : "Product Performance"}
              </h3>
              <p className="odSubtitle" style={{ marginTop: "2px" }}>
                {tableMode === "offers"
                  ? "Track performance and conversion across all upsell offers"
                  : "Track performance across target products"}
              </p>
            </div>
            <div className="odTableControls">
              <label className="odSortSelect">
                <span>View</span>
                <select
                  value={tableMode}
                  onChange={(e) => setTableMode(e.target.value as "offers" | "products")}
                >
                  <option value="offers">Offers</option>
                  <option value="products">Products</option>
                </select>
              </label>

              <label className="odSortSelect">
                <span>Sort by</span>
                <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
                  <option value="purchases">Most Purchases</option>
                  <option value="views">Most Views</option>
                  <option value="clicks">Most Clicks</option>
                  <option value="revenue">Highest Revenue</option>
                  <option value="conversion">Highest Conversion Rate</option>
                </select>
              </label>

              <div className="odSearchInput">
                <SearchIcon />
                <input
                  type="text"
                  placeholder={tableMode === "offers" ? "Search offers..." : "Search products..."}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="odTableWrapper">
            {tableMode === "offers" ? (
              <table className="odTable">
                <thead>
                  <tr>
                    <th>Offer</th>
                    <th>Offer ID</th>
                    <th>Views</th>
                    <th>Clicks</th>
                    <th>CTR</th>
                    <th>Add to Cart</th>
                    <th>Purchases</th>
                    <th>Conversion Rate</th>
                    <th>Revenue</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOffers.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ textAlign: "center", padding: "28px", color: "#6b7280" }}>
                        No upsell offers found.
                      </td>
                    </tr>
                  ) : (
                    filteredOffers.map((offer) => (
                      <tr key={offer.offerId}>
                        <td>
                          <div className="odProductCell">
                            <button
                              type="button"
                              onClick={() => navigate(offerDetailUrl(offer.offerId))}
                              style={{
                                background: "none",
                                border: "none",
                                padding: 0,
                                textAlign: "left",
                                cursor: "pointer",
                                font: "inherit",
                              }}
                            >
                              <span className="odProductName" style={{ color: "#111827" }}>
                                {offer.offerName}
                              </span>
                            </button>
                            <span className="odProductSubtitle">Upsell Offer</span>
                          </div>
                        </td>
                        <td>
                          <span className="odProductId">{formatProductId(offer.offerId)}</span>
                        </td>
                        <td>{offer.views.toLocaleString()}</td>
                        <td>{offer.clicks.toLocaleString()}</td>
                        <td>{offer.ctr.toFixed(1)}%</td>
                        <td>{offer.addedToCart.toLocaleString()}</td>
                        <td>{offer.purchases.toLocaleString()}</td>
                        <td>{offer.convRate.toFixed(1)}%</td>
                        <td>{formatCurrency(offer.revenue)}</td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            type="button"
                            onClick={() => navigate(offerDetailUrl(offer.offerId))}
                            className="odActionLink odActionEdit"
                          >
                            View Analytics →
                          </button>
                          <AdminAppLink
                            to={`/app/offers/new?id=${encodeURIComponent(offer.offerId)}`}
                            className="odActionLink"
                            style={{ color: "#4b5563" }}
                          >
                            Edit
                          </AdminAppLink>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : (
              <table className="odTable">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Product ID</th>
                    <th>Views</th>
                    <th>Clicks</th>
                    <th>CTR</th>
                    <th>Add to Cart</th>
                    <th>Purchases</th>
                    <th>Conversion Rate</th>
                    <th>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: "center", padding: "28px", color: "#6b7280" }}>
                        No products found.
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((prod) => (
                      <tr key={prod.productId}>
                        <td>
                          <div className="odProductCell">
                            <span className="odProductName">{prod.productName}</span>
                            <span className="odProductSubtitle">Target Product</span>
                          </div>
                        </td>
                        <td>
                          <span className="odProductId">{formatProductId(prod.productId)}</span>
                        </td>
                        <td>{prod.views.toLocaleString()}</td>
                        <td>{prod.clicks.toLocaleString()}</td>
                        <td>{prod.ctr.toFixed(1)}%</td>
                        <td>{prod.addedToCart.toLocaleString()}</td>
                        <td>{prod.purchases.toLocaleString()}</td>
                        <td>{prod.convRate.toFixed(1)}%</td>
                        <td>{formatCurrency(prod.revenue)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
