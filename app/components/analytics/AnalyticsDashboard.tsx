import { useMemo, useState, useEffect } from "react";

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
  onOpenOfferDetails: (offerId: string) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
};

type MetricKey = "views" | "clicks" | "addedToCart" | "purchases";

const formatMetric = (value: number) =>
  new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 10000 ? 1 : 0,
    notation: value >= 10000 ? "compact" : "standard",
  }).format(value);

const formatPercent = (value: number | null | undefined) =>
  value == null ? "—" : `${(value * 100).toFixed(1)}%`;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

const RANK_MEDALS = ["🥇", "🥈", "🥉"];

function StatCard({
  label,
  value,
  delta,
  deltaTone,
}: {
  label: string;
  value: number | string;
  delta?: string;
  deltaTone?: "positive" | "negative";
}) {
  return (
    <div className="analytics-stat-card">
      <span className="analytics-kpi-label">{label}</span>
      <strong className="analytics-kpi-value">{value}</strong>
      {delta ? (
        <span className={`analytics-kpi-delta analytics-kpi-delta-${deltaTone ?? "positive"}`}>
          <span className="analytics-kpi-delta-arrow">{deltaTone === "negative" ? "▼" : "▲"}</span>
          {delta}
        </span>
      ) : null}
    </div>
  );
}

function OfferListRow({
  rank,
  label,
  subtitle,
  value,
  valueLabel,
  percentOfMax,
  onOpen,
}: {
  rank: number;
  label: string;
  subtitle?: string;
  value: number;
  valueLabel: string;
  percentOfMax: number;
  onOpen?: () => void;
}) {
  return (
    <div className="analytics-offer-row" onClick={onOpen} role={onOpen ? "button" : undefined}>
      <div className="analytics-offer-main">
        <div className="analytics-rank-badge">{RANK_MEDALS[rank - 1] ?? rank}</div>
        <div className="analytics-offer-meta">
          <div className="analytics-offer-name">{label}</div>
          {subtitle ? <div className="analytics-offer-subtitle">{subtitle}</div> : null}
          <div className="analytics-offer-bar-wrap">
            <div className="analytics-offer-bar" style={{ width: `${clamp(percentOfMax, 4, 100)}%` }} />
          </div>
        </div>
      </div>
      <div className="analytics-offer-side">
        <div className="analytics-offer-value">
          {formatMetric(value)} <span className="analytics-offer-value-label">{valueLabel}</span>
        </div>
      </div>
    </div>
  );
}

function FunnelStep({
  label,
  value,
  widthPercent,
  colorFrom,
  colorTo,
  isFlagged,
}: {
  label: string;
  value: number;
  widthPercent: number;
  colorFrom: string;
  colorTo: string;
  isFlagged: boolean;
}) {
  return (
    <div className="analytics-funnel-segment">
      <div
        className={`analytics-funnel-wedge ${isFlagged ? "is-flagged" : ""}`}
        style={{
          clipPath: `polygon(${(100 - widthPercent) / 2}% 0%, ${100 - (100 - widthPercent) / 2}% 0%, 100% 100%, 0% 100%)`,
          background: `linear-gradient(180deg, ${colorFrom}, ${colorTo})`,
        }}
      >
        <span className="analytics-funnel-wedge-label">{label}</span>
        <span className="analytics-funnel-wedge-value">{formatMetric(value)}</span>
      </div>
    </div>
  );
}

export default function AnalyticsDashboard({
  viewMetrics: initViewMetrics,
  clickMetrics: initClickMetrics,
  addedToCartMetrics: initAddedToCartMetrics,
  purchaseMetrics: initPurchaseMetrics,
  trendMetrics: initTrendMetrics,
  productMetaMap: initProductMetaMap,
  onOpenOfferDetails,
  onRefresh,
  isRefreshing = false,
}: AnalyticsDashboardProps) {
  const [selectedMetrics, setSelectedMetrics] = useState<Set<MetricKey>>(
    new Set(["views", "clicks", "purchases"]),
  );
  const [selectedRankingMetric, setSelectedRankingMetric] = useState<"purchases" | "clicks" | "views">("purchases");
  const [mainProductFilter, setMainProductFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [timeRangeFilter, setTimeRangeFilter] = useState("30d");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const [viewMetrics, setViewMetrics] = useState(initViewMetrics);
  const [clickMetrics, setClickMetrics] = useState(initClickMetrics);
  const [addedToCartMetrics, setAddedToCartMetrics] = useState(initAddedToCartMetrics);
  const [purchaseMetrics, setPurchaseMetrics] = useState(initPurchaseMetrics);
  const [productMetaMap, setProductMetaMap] = useState(initProductMetaMap);

  const totalViews = viewMetrics.totalViews;
  const totalClicks = clickMetrics.totalClicks;
  const totalAddedToCart = addedToCartMetrics.totalAddedToCart;
  const totalPurchases = purchaseMetrics.totalPurchases;
  const totalRevenue = purchaseMetrics.totalRevenue ?? 0;
  const conversionRate = totalViews > 0 ? totalPurchases / totalViews : null;

  const chartSeries = useMemo(
    () => [
      { key: "views" as MetricKey, label: "Views", value: totalViews, color: "#2f6de5", phase: 0 },
      { key: "clicks" as MetricKey, label: "Clicks", value: totalClicks, color: "#f39d2a", phase: 1.4 },
      { key: "addedToCart" as MetricKey, label: "Add to Cart", value: totalAddedToCart, color: "#7c6ce0", phase: 2.6 },
      { key: "purchases" as MetricKey, label: "Purchases", value: totalPurchases, color: "#1a7d4e", phase: 3.8 },
    ],
    [totalViews, totalClicks, totalAddedToCart, totalPurchases],
  );

  const toggleMetric = (key: MetricKey) => {
    setSelectedMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        // never allow zero metrics selected
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const summaryMetrics = [
    { label: "Impressions", value: formatMetric(totalViews), delta: undefined, deltaTone: undefined },
    { label: "Views", value: formatMetric(totalViews), delta: undefined, deltaTone: undefined },
    { label: "Clicks", value: formatMetric(totalClicks), delta: undefined, deltaTone: undefined },
    { label: "Add to Cart", value: formatMetric(totalAddedToCart), delta: undefined, deltaTone: undefined },
    { label: "Purchases", value: formatMetric(totalPurchases), delta: undefined, deltaTone: undefined },
    { label: "Conv. Rate", value: formatPercent(conversionRate), delta: undefined, deltaTone: undefined },
    {
      label: "Revenue",
      value:
        totalRevenue >= 1000
          ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(totalRevenue)
          : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(totalRevenue),
      delta: undefined,
      deltaTone: undefined,
    },
  ];

  const [localTrendMetrics, setLocalTrendMetrics] = useState(initTrendMetrics);

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

    // Special handling for 90-day range: aggregate into 3 month-wise buckets
    if (days === 90) {
      const raw = {
        labels: takeLabels(source.labels),
        views: takeLastOrPad(source.views),
        clicks: takeLastOrPad(source.clicks),
        addedToCart: takeLastOrPad(source.addedToCart),
        purchases: takeLastOrPad(source.purchases),
      };

      const bucketSize = Math.ceil(90 / 3); // ~30
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

      // build month labels based on current month
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

    // For 7d and 30d, always show recent date labels (e.g. "Aug 19") instead of generic placeholders
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
    const mapRangeToDays = (r: string) => (r === "7d" ? 7 : r === "30d" ? 30 : r === "90d" ? 90 : 30);
    const days = mapRangeToDays(timeRangeFilter);
    let cancelled = false;

    (async () => {
      try {
        const params = new URLSearchParams({ days: String(days), status: statusFilter });
        const res = await fetch(`/api/analytics/dashboard?${params.toString()}`, { credentials: "same-origin" });
        if (!res.ok) {
          try {
            const txt = await res.text();
            // eslint-disable-next-line no-console
            console.warn("Failed to load dashboard metrics:", res.status, txt.slice(0, 200));
          } catch {
            // ignore
          }
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          if (data.viewMetrics) setViewMetrics(data.viewMetrics);
          if (data.clickMetrics) setClickMetrics(data.clickMetrics);
          if (data.addedToCartMetrics) setAddedToCartMetrics(data.addedToCartMetrics);
          if (data.purchaseMetrics) setPurchaseMetrics(data.purchaseMetrics);
          if (data.trendMetrics) setLocalTrendMetrics(data.trendMetrics);
          if (data.productMetaMap) setProductMetaMap(data.productMetaMap);
        }
      } catch {
        // ignore fetch errors; keep existing metrics
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [timeRangeFilter, statusFilter, mainProductFilter]);

  // Immediately adjust local trend metrics to match the selected time range
  useEffect(() => {
    const days = mapRangeToDays(timeRangeFilter);
    setLocalTrendMetrics((prev) => adjustTrendMetrics(prev ?? initTrendMetrics, days));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRangeFilter, initTrendMetrics]);

  const trendByMetric = useMemo(() => {
    const map: Record<MetricKey, number[]> = { views: [], clicks: [], addedToCart: [], purchases: [] };
    const source = localTrendMetrics ?? initTrendMetrics ?? {
      labels: Array.from({ length: 12 }, (_, index) => `${index + 1}`),
      views: Array(12).fill(0),
      clicks: Array(12).fill(0),
      addedToCart: Array(12).fill(0),
      purchases: Array(12).fill(0),
    };

    map.views = source.views.length ? source.views : Array(12).fill(0);
    map.clicks = source.clicks.length ? source.clicks : Array(12).fill(0);
    map.addedToCart = source.addedToCart.length ? source.addedToCart : Array(12).fill(0);
    map.purchases = source.purchases.length ? source.purchases : Array(12).fill(0);
    return map;
  }, [localTrendMetrics, initTrendMetrics]);

  const activeSeries = chartSeries.filter((s) => selectedMetrics.has(s.key));
  const allActiveValues = activeSeries.flatMap((s) => trendByMetric[s.key]);
  const chartMax = Math.max(...allActiveValues, 1);
  const chartMin = 0;
  const pointCount = (localTrendMetrics ?? initTrendMetrics)?.views?.length ?? 12;

  const toXY = (v: number, i: number) => {
    const x = (i / (pointCount - 1)) * 1000;
    const y = 276 - ((v - chartMin) / (chartMax - chartMin || 1)) * 234;
    return { x, y };
  };

  const buildLinePath = (values: number[]) =>
    values
      .map((v, i) => {
        const { x, y } = toXY(v, i);
        return `${i === 0 ? "M" : "L"}${x},${y}`;
      })
      .join(" ");

  const buildAreaPath = (values: number[]) => `${buildLinePath(values)} L1000,300 L0,300 Z`;

  const yAxisLabels = [chartMax, chartMax * 0.75, chartMax * 0.5, chartMax * 0.25].map((v) => formatMetric(v));
  const xAxisLabels = (localTrendMetrics ?? initTrendMetrics)?.labels?.length
    ? (localTrendMetrics ?? initTrendMetrics)!.labels
    : Array.from({ length: Math.min(pointCount, 6) }, (_, index) => `D${index + 1}`);

  const stageConversionRows = [
    { label: "Views → Clicked", rate: totalViews > 0 ? totalClicks / totalViews : null },
    { label: "Clicked → Added to Cart", rate: totalClicks > 0 ? totalAddedToCart / totalClicks : null },
    { label: "Added to Cart → Purchased", rate: totalAddedToCart > 0 ? totalPurchases / totalAddedToCart : null },
  ];

  const lowestStageIndex = stageConversionRows.reduce((lowestIdx, row, idx, arr) => {
    if (row.rate == null) return lowestIdx;
    if (lowestIdx === -1 || (arr[lowestIdx].rate ?? Infinity) > row.rate) return idx;
    return lowestIdx;
  }, -1);

  // Funnel: one consistent green -> teal gradient family, top (Shown) darkest,
  // bottom (Purchased) brightest emerald — matches the reference image.
  // The stage immediately after the worst drop-off gets a red tint to flag it.
  const funnelPalette = [
    { from: "#0f6b46", to: "#1a8a5c" }, // Shown
    { from: "#12866f", to: "#189e89" }, // Clicked
    { from: "#149a8b", to: "#1cae9d" }, // Added to Cart
    { from: "#1ca97c", to: "#22c98f" }, // Purchased
  ];
  const flaggedStage = { from: "#e0596a", to: "#d34c4c" };

  const funnelSteps = [
    { label: "Shown", value: totalViews, widthPercent: 100 },
    {
      label: "Clicked",
      value: totalClicks,
      widthPercent: totalViews > 0 ? clamp((totalClicks / totalViews) * 100, 30, 92) : 30,
    },
    {
      label: "Added to Cart",
      value: totalAddedToCart,
      widthPercent: totalClicks > 0 ? clamp((totalAddedToCart / totalClicks) * 75, 24, 70) : 24,
    },
    {
      label: "Purchased",
      value: totalPurchases,
      widthPercent: totalAddedToCart > 0 ? clamp((totalPurchases / totalAddedToCart) * 55, 16, 50) : 16,
    },
  ];

  const funnelDropoffs = [
    { continued: totalViews > 0 ? totalClicks / totalViews : null },
    { continued: totalClicks > 0 ? totalAddedToCart / totalClicks : null },
    { continued: totalAddedToCart > 0 ? totalPurchases / totalAddedToCart : null },
  ];

  const rankingData = useMemo(() => {
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

    return Array.from(allOfferIds)
      .map((offerId) => ({
        offerId,
        offerName: offerIdToName.get(offerId) ?? "Unknown offer",
        purchases: offerIdToPurchases[offerId] ?? 0,
        clicks: offerIdToClicks[offerId] ?? 0,
        views: offerIdToViews[offerId] ?? 0,
      }))
      .sort((a, b) => {
        if (selectedRankingMetric === "clicks") return b.clicks - a.clicks;
        if (selectedRankingMetric === "views") return b.views - a.views;
        return b.purchases - a.purchases;
      })
      .slice(0, 5);
  }, [selectedRankingMetric, clickMetrics.offerBreakdown, purchaseMetrics.offerBreakdown, viewMetrics.offerBreakdown, addedToCartMetrics.offerBreakdown]);

  const maxRankingValue = Math.max(...rankingData.map((row) => row[selectedRankingMetric]), 1);
  const rankingUnitLabel =
    selectedRankingMetric === "purchases" ? "purchases" : selectedRankingMetric === "clicks" ? "clicks" : "views";

  return (
    <div className="analytics-page-shell">
      <div className="analytics-page">
        <header className="analytics-header">
          <div>
            <h1 className="analytics-title">Upsell Analytics</h1>
            <p className="analytics-subtitle">
              Understand how your upsell offers are performing and which products generate the most conversions.
            </p>
          </div>

          <div className="analytics-filters" aria-label="Analytics filters">
            <label className="analytics-filter-control">
              <select value={timeRangeFilter} onChange={(event) => setTimeRangeFilter(event.target.value)}>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
              </select>
            </label>
            <button type="button" className="analytics-icon-button" aria-label="Download report">
              <span aria-hidden="true">⬇</span>
            </button>
            <button
              type="button"
              className="analytics-icon-button"
              aria-label="Refresh analytics"
              onClick={() => onRefresh?.()}
              disabled={isRefreshing}
              title={isRefreshing ? "Refreshing data..." : "Refresh analytics"}
            >
              <span aria-hidden="true">↻</span>
            </button>
          </div>
        </header>

        <section className="analytics-kpi-grid" aria-label="Analytics summary metrics">
          {summaryMetrics.map((metric) => (
            <StatCard
              key={metric.label}
              label={metric.label}
              value={metric.value}
              delta={metric.delta}
              deltaTone={metric.deltaTone}
            />
          ))}
        </section>

        <section className="analytics-main-grid">
          <article className="analytics-card analytics-card-wide">
            <div className="analytics-card-header">
              <div>
                <h2>Upsell Performance</h2>
                <p>Toggle metrics to compare trends over time</p>
              </div>
            </div>

            <div className="analytics-legend">
              {chartSeries.map((metric) => {
                const isActive = selectedMetrics.has(metric.key);
                return (
                  <button
                    key={metric.key}
                    type="button"
                    aria-pressed={isActive}
                    className={`analytics-legend-button ${isActive ? "is-active" : ""}`}
                    onClick={() => toggleMetric(metric.key)}
                    style={
                      isActive
                        ? {
                            borderColor: metric.color,
                            color: metric.color,
                            background: `${metric.color}14`,
                          }
                        : undefined
                    }
                  >
                    <span className="analytics-legend-dot" style={{ background: metric.color }} />
                    {metric.label}
                  </button>
                );
              })}
            </div>

            <div className="analytics-chart-wrap">
              <div className="analytics-chart-body">
                <div className="analytics-chart-yaxis">
                  {yAxisLabels.map((label, idx) => (
                    <span key={`${label}-${idx}`}>{label}</span>
                  ))}
                  <span>0</span>
                </div>

                <div className="analytics-chart-svg-wrap">
                  <svg
                    className="analytics-chart"
                    viewBox="0 0 1000 300"
                    preserveAspectRatio="none"
                    aria-label="Analytics performance chart"
                  >
                    {[0, 75, 150, 225, 300].map((row) => (
                      <line key={row} x1="0" x2="1000" y1={row} y2={row} className="analytics-chart-grid" />
                    ))}

                    {/* area fill only when a single metric is isolated, matching the reference */}
                    {activeSeries.length === 1 ? (
                      <path
                        d={buildAreaPath(trendByMetric[activeSeries[0].key])}
                        className="analytics-chart-area"
                        style={{ fill: `${activeSeries[0].color}1a` }}
                      />
                    ) : null}

                    {hoveredIndex != null ? (
                      <line
                        x1={(hoveredIndex / (pointCount - 1)) * 1000}
                        x2={(hoveredIndex / (pointCount - 1)) * 1000}
                        y1="0"
                        y2="300"
                        className="analytics-chart-hover-line"
                        vectorEffect="non-scaling-stroke"
                      />
                    ) : null}

                    {activeSeries.map((series) => (
                      <path
                        key={series.key}
                        d={buildLinePath(trendByMetric[series.key])}
                        className="analytics-chart-line"
                        style={{ stroke: series.color }}
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}

                    {activeSeries.map((series) =>
                      trendByMetric[series.key].map((v, i) => {
                        const { x, y } = toXY(v, i);
                        return (
                          <circle
                            key={`${series.key}-${i}`}
                            cx={x}
                            cy={y}
                            r={hoveredIndex === i ? 7 : 5}
                            className="analytics-chart-point"
                            style={{ fill: series.color }}
                            vectorEffect="non-scaling-stroke"
                            onMouseEnter={() => setHoveredIndex(i)}
                            onMouseLeave={() => setHoveredIndex(null)}
                          />
                        );
                      }),
                    )}
                  </svg>

                  {hoveredIndex != null ? (
                    <div
                      className="analytics-chart-tooltip"
                      style={{ left: `${(hoveredIndex / (pointCount - 1)) * 100}%` }}
                    >
                      <div className="analytics-chart-tooltip-title">
                        {xAxisLabels[Math.min(hoveredIndex, xAxisLabels.length - 1)]}
                      </div>
                      {activeSeries.map((series) => (
                        <div key={series.key} className="analytics-chart-tooltip-row">
                          <span style={{ color: series.color }}>{series.label}</span>
                          <strong>{formatMetric(trendByMetric[series.key][hoveredIndex])}</strong>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="analytics-chart-xaxis">
                {xAxisLabels.map((label, i) => {
                  const basePct = pointCount > 1 ? (i / (pointCount - 1)) * 100 : 0;
                  const offsetPct = timeRangeFilter === "90d" ? 4 : 1.5;
                  const extraFirst = (i === 0 && (timeRangeFilter === "7d" || timeRangeFilter === "30d")) ? 3 : 0;
                  // For 7d/30d ranges, labels are date strings like "Aug 19" - render day above month
                  const isDayMonth = (timeRangeFilter === "7d" || timeRangeFilter === "30d") && typeof label === "string" && label.includes(" ");

                  // Additional tiny nudge for specific days in the 7-day view (Aug 21/22)
                  let extraDayOffset = 0;
                  if (timeRangeFilter === "7d" && isDayMonth) {
                    const m = String(label).match(/(\d+)/);
                    const dayNum = m ? Number(m[1]) : NaN;
                    if (dayNum === 21 || dayNum === 22) extraDayOffset = 2; // small right nudge
                  }

                  const leftPct = Math.min(100, Math.max(0, basePct + offsetPct + extraFirst + extraDayOffset));

                  return (
                    <span key={`${String(label)}-${i}`} style={{ left: `${leftPct.toFixed(2)}%` }}>
                      {isDayMonth ? (
                        (() => {
                          const parts = String(label).split(" ");
                          const month = parts[0];
                          const day = parts.slice(1).join(" ");
                          return (
                            <>
                              <div className="analytics-xaxis-day">{day}</div>
                              <div className="analytics-xaxis-month">{month}</div>
                            </>
                          );
                        })()
                      ) : (
                        String(label)
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          </article>

          <aside className="analytics-card analytics-card-compact">
            <div className="analytics-card-header">
              <div>
                <h2>Conversion Funnel</h2>
                <p>See where customers drop off</p>
              </div>
            </div>

            <div className="analytics-funnel-list">
              {funnelSteps.map((step, index) => {
                const isFlagged = index === lowestStageIndex + 1;
                const palette = isFlagged ? flaggedStage : funnelPalette[index];
                return (
                  <div key={step.label}>
                    <FunnelStep
                      label={step.label}
                      value={step.value}
                      widthPercent={step.widthPercent}
                      colorFrom={palette.from}
                      colorTo={palette.to}
                      isFlagged={isFlagged}
                    />
                    {index < funnelDropoffs.length ? (
                      <div className="analytics-funnel-dropoff">
                        <span>{formatPercent(funnelDropoffs[index].continued)} continued</span>
                        <span
                          className={
                            index === lowestStageIndex
                              ? "analytics-funnel-dropoff-bad"
                              : "analytics-funnel-dropoff-muted"
                          }
                        >
                          {index === lowestStageIndex ? "⚠ " : ""}
                          {funnelDropoffs[index].continued == null
                            ? "—"
                            : `${((1 - funnelDropoffs[index].continued!) * 100).toFixed(0)}% dropped`}
                        </span>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="analytics-funnel-footer">
              <span>Overall conversion rate</span>
              <strong>{formatPercent(conversionRate)}</strong>
            </div>
          </aside>
        </section>

        <section className="analytics-bottom-grid">
          <article className="analytics-card analytics-list-card">
            <div className="analytics-card-header analytics-card-header-row">
              <div>
                <h2>🏆 Top Performing Upsells</h2>
                <p>Rank your upsell offers by key metrics</p>
              </div>
              <div className="analytics-rank-select-wrap">
                <select
                  id="analytics-ranking-metric"
                  value={selectedRankingMetric}
                  onChange={(event) => setSelectedRankingMetric(event.target.value as "purchases" | "clicks" | "views")}
                >
                  <option value="purchases">Most Purchases</option>
                  <option value="clicks">Most Clicks</option>
                  <option value="views">Most Views</option>
                </select>
              </div>
            </div>

            <div className="analytics-offer-list">
              {rankingData.length === 0 ? (
                <div className="analytics-empty-state">No offer data available yet.</div>
              ) : (
                rankingData.map((offer, index) => (
                  <OfferListRow
                    key={offer.offerId}
                    rank={index + 1}
                    label={offer.offerName}
                    subtitle={productMetaMap.titles[offer.offerId] ? productMetaMap.titles[offer.offerId] : undefined}
                    value={offer[selectedRankingMetric]}
                    valueLabel={rankingUnitLabel}
                    percentOfMax={(offer[selectedRankingMetric] / maxRankingValue) * 100}
                    onOpen={() => onOpenOfferDetails(offer.offerId)}
                  />
                ))
              )}
            </div>
          </article>

          <aside className="analytics-card analytics-list-card">
            <div className="analytics-card-header">
              <div>
                <h2>Stage Conversion</h2>
                <p>Track how each stage performs</p>
              </div>
            </div>

            <div className="analytics-stage-list">
              {stageConversionRows.map((row, index) => (
                <div key={row.label} className="analytics-stage-row">
                  <div className="analytics-stage-row-top">
                    <span className="analytics-stage-label">{row.label}</span>
                    <span
                      className={
                        index === lowestStageIndex ? "analytics-stage-value analytics-stage-value-bad" : "analytics-stage-value"
                      }
                    >
                      {formatPercent(row.rate)}
                    </span>
                  </div>
                  <div className="analytics-stage-bar-wrap">
                    <div
                      className={index === lowestStageIndex ? "analytics-stage-bar is-bad" : "analytics-stage-bar"}
                      style={{ width: `${clamp((row.rate ?? 0) * 100, 3, 100)}%` }}
                    />
                  </div>
                  {index === lowestStageIndex ? <div className="analytics-stage-flag">⚠ Biggest drop-off</div> : null}
                </div>
              ))}
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}