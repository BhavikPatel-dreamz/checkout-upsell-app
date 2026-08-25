import type { Offer as OfferRecord } from "@prisma/client";

import { PLACEMENT_LABELS, getOfferTypeConfig } from "../types/offer";

type DashboardProps = {
  productTitleByProductId: Record<string, string>;
  metrics: {
    totalViews: number;
    offerBreakdown: Array<{ offerId: string; offerName: string; views: number }>;
  };
  clickMetrics: {
    totalClicks: number;
    offerBreakdown: Array<{ offerId: string; offerName: string; clicks: number }>;
  };
  addedToCartMetrics: {
    totalAddedToCart: number;
    offerBreakdown: Array<{ offerId: string; offerName: string; addedToCart: number }>;
  };
  purchaseMetrics: {
    totalPurchases: number;
    totalRevenue: number;
    offerBreakdown: Array<{ offerId: string; offerName: string; purchases: number }>;
  };
  visibleOffers: OfferRecord[];
  deletingId: string | null;
  deleteTarget: { id: string; title: string } | null;
  activeTab: "Dashboard" | "Help";
  toast: string | null;
  onActiveTabChange: (tab: "Dashboard" | "Help") => void;
  onCreate: () => void;
  onEdit: (id: string) => void;
  onToggleStatus: (id: string) => void;
  onDelete: (id: string) => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onViewDetails: (section: string) => void;
  onViewAnalytics: () => void;
  onViewAllUpsells: () => void;
  onViewOfferAnalytics: (offerId: string) => void;
};


export default function Dashboard({
  productTitleByProductId,
  metrics,
  clickMetrics,
  addedToCartMetrics,
  purchaseMetrics,
  visibleOffers,
  deletingId,
  deleteTarget,
  activeTab,
  toast,
  onActiveTabChange,
  onCreate,
  onEdit,
  onToggleStatus,
  onDelete,
  onConfirmDelete,
  onCancelDelete,
  onViewDetails,
  onViewAnalytics,
  onViewAllUpsells,
  onViewOfferAnalytics,
}: DashboardProps) {
  function productTitlesForOffer(offer: OfferRecord) {
    const titles: string[] = [];
    try {
      const rules = (offer.triggerRules as Record<string, unknown>) ?? {};
      const selection =
        (rules.productSelection as { items?: unknown } | undefined) ?? null;
      const manualSelections =
        (rules.manualSelections as unknown[] | undefined) ?? [];
      const items = Array.isArray(selection?.items)
        ? (selection.items as Array<{ productId?: unknown }>)
        : Array.isArray(manualSelections)
          ? (manualSelections as Array<{ productId?: unknown }>)
          : [];
      for (const it of items) {
        if (it && typeof it.productId === "string") {
          const t = productTitleByProductId[it.productId] ?? "Product unavailable";
          if (!titles.includes(t)) titles.push(t);
        }
      }
    } catch (e) {
      // ignore
    }
    if (Array.isArray(offer.targetProductIds)) {
      for (const pid of offer.targetProductIds) {
        const t = productTitleByProductId[pid] ?? "Product unavailable";
        if (!titles.includes(t)) titles.push(t);
      }
    }
    return titles;
  }

  function subtitleForOffer(offer: OfferRecord) {
    const titles = productTitlesForOffer(offer);
    if (titles.length === 0) return "Product unavailable";
    if (titles.length <= 2) return `for ${titles.join(", ")}`;
    return `for ${titles[0]} + ${titles.length - 1}`;
  }

  // Real, dynamic data
  const totalViews = metrics.totalViews;
  const totalClicks = clickMetrics.totalClicks;
  const totalAddedToCart = addedToCartMetrics.totalAddedToCart;
  const totalPurchases = purchaseMetrics.totalPurchases;
  const totalRevenue = purchaseMetrics.totalRevenue ?? 0;
  const conversionRate = totalViews > 0 ? totalPurchases / totalViews : null;

  const activeCount = visibleOffers.filter((o) => Boolean(o.isActive)).length;

  const formatCurrency = (value: number) =>
    value >= 1000
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          notation: "compact",
          maximumFractionDigits: 1,
        }).format(value)
      : new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(value);

  const formatCompact = (value: number) =>
    new Intl.NumberFormat("en-US", {
      maximumFractionDigits: value >= 10000 ? 1 : 0,
      notation: value >= 10000 ? "compact" : "standard",
    }).format(value);

  const formatPercent = (value: number | null) =>
    value == null ? "—" : `${(value * 100).toFixed(1)}%`;

  // Build per-offer metrics lookup from breakdown data
  const offerIdToViews = new Map(
    (metrics.offerBreakdown ?? []).map((r: { offerId: string; views: number }) => [r.offerId, r.views]),
  );
  const offerIdToPurchases = new Map(
    purchaseMetrics.offerBreakdown.map((r) => [r.offerId, r.purchases]),
  );

  // Determine top performer: active offer with the most purchases, falling back to views
  const topPerformer =
    visibleOffers
      .filter((o) => Boolean(o.isActive))
      .sort((a, b) => {
        const purchasesA = offerIdToPurchases.get(a.id) ?? 0;
        const purchasesB = offerIdToPurchases.get(b.id) ?? 0;
        if (purchasesB !== purchasesA) return purchasesB - purchasesA;
        const viewsA = offerIdToViews.get(a.id) ?? 0;
        const viewsB = offerIdToViews.get(b.id) ?? 0;
        return viewsB - viewsA;
      })[0] ?? null;

  return (
    <div className="page appPageShell">
      {activeTab === "Help" ? (
        <div className="placeholderSection">
          <h2 className="placeholderHeading">Help</h2>
          <p className="placeholderText">Help &amp; documentation will appear here.</p>
        </div>
      ) : (
        <div className="content appPageContent">
          <div className="pageHeader">
            <h1 className="pageTitle">Dashboard</h1>
            <p className="pageSubtitle">Overview of your upsell program · Last 30 days</p>
          </div>

          <div className="statGrid statGrid4">
            <StatCard
              label="Impressions"
              value={formatCompact(totalViews)}
              onViewDetails={() => onViewDetails("Impressions")}
            />
            <StatCard
              label="Purchases"
              value={formatCompact(totalPurchases)}
              onViewDetails={() => onViewDetails("Purchases")}
            />
            <StatCard
              label="Conv. Rate"
              value={formatPercent(conversionRate)}
              onViewDetails={() => onViewDetails("Conv. Rate")}
            />
            <StatCard
              label="Revenue"
              value={formatCurrency(totalRevenue)}
              onViewDetails={() => onViewDetails("Revenue")}
            />
          </div>

          <div className="actionRow">
            <button className="actionCard actionCardPrimary" onClick={onCreate}>
              <span className="actionIcon actionIconPrimary">
                <BoltIcon />
              </span>
              <span className="actionCardText">
                <span className="actionCardTitle">Create Upsell</span>
                <span className="actionCardSubtitle actionCardSubtitlePrimary">
                  Set up a new offer
                </span>
              </span>
              <span className="actionChevron actionChevronPrimary">›</span>
            </button>

            <button
              className="actionCard"
              onClick={onViewAnalytics}
            >
              <span className="actionIcon">
                <ChartIcon />
              </span>
              <span className="actionCardText">
                <span className="actionCardTitle">View Analytics</span>
                <span className="actionCardSubtitle">Funnel · Charts · Insights</span>
              </span>
              <span className="actionChevron">›</span>
            </button>

            <button className="actionCard" onClick={onViewAllUpsells}>
              <span className="actionIcon">
                <ListIcon />
              </span>
              <span className="actionCardText">
                <span className="actionCardTitle">All Upsells</span>
                <span className="actionCardSubtitle">
                  {activeCount} active offer{activeCount === 1 ? "" : "s"}
                </span>
              </span>
              <span className="actionChevron">›</span>
            </button>
          </div>

          {topPerformer && (
            <div className="featuredBanner">
              <div className="featuredLeft">
                <div className="featuredLabel">Top Performer</div>
                <div className="featuredTitle">{topPerformer.name}</div>
                <div className="featuredSubtitle">{subtitleForOffer(topPerformer)}</div>
              </div>
              <div className="featuredRight">
                <div className="featuredStat">
                  <div className="featuredStatValue">
                    {formatPercent(
                      (offerIdToViews.get(topPerformer.id) ?? 0) > 0
                        ? (offerIdToPurchases.get(topPerformer.id) ?? 0) /
                            (offerIdToViews.get(topPerformer.id) ?? 1)
                        : null,
                    )}
                  </div>
                  <div className="featuredStatLabel">Conv. rate</div>
                </div>
                <div className="featuredStat">
                  <div className="featuredStatValue">
                    {formatCompact(offerIdToPurchases.get(topPerformer.id) ?? 0)}
                  </div>
                  <div className="featuredStatLabel">Purchases</div>
                </div>
                <button
                  className="featuredLink"
                  onClick={() => onViewOfferAnalytics(topPerformer.id)}
                >
                  View details →
                </button>
              </div>
            </div>
          )}

          <div id="active-upsells-section" className="tableSection">
            <div className="tableSectionHeader">
              <h2 className="sectionHeading">Active Upsells</h2>
              <button
                className="viewAllLink"
                onClick={onViewAllUpsells}
              >
                View all →
              </button>
            </div>

            {visibleOffers.length === 0 ? (
              <div className="emptyCell">There are no data</div>
            ) : (
              <div className="offerList">
                {visibleOffers.map((offer: OfferRecord) => {
                  const offerViews = offerIdToViews.get(offer.id) ?? 0;
                  const offerPurchases = offerIdToPurchases.get(offer.id) ?? 0;
                  const offerConvRate =
                    offerViews > 0 ? offerPurchases / offerViews : null;

                  return (
                    <div key={offer.id} className="offerRow">
                      <div className="offerInfo">
                        <div className="offerTitle">{offer.name}</div>
                        <div className="offerSubtitle">{subtitleForOffer(offer)}</div>
                      </div>

                      <span
                        className={offer.isActive ? "badge badgeActive" : "badge badgeDraft"}
                      >
                        {offer.isActive ? "Active" : "Draft"}
                      </span>

                      <div className="offerStat">
                        <div className="offerStatValue offerStatValuePositive">
                          {formatPercent(offerConvRate)}
                        </div>
                        <div className="offerStatLabel">conv.</div>
                      </div>

                      <div className="offerStat">
                        <div className="offerStatValue">
                          {formatCompact(offerPurchases)}
                        </div>
                        <div className="offerStatLabel">purchases</div>
                      </div>

                      <div className="offerActions">
                        <button className="linkButton" onClick={() => onEdit(offer.id)}>
                          Edit
                        </button>
                        <button
                          className={
                            deletingId === offer.id
                              ? "linkButton linkButtonDisabled"
                              : "linkButton linkButtonDanger"
                          }
                          onClick={() => onDelete(offer.id)}
                          disabled={deletingId === offer.id}
                        >
                          {deletingId === offer.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="modalBackdrop">
          <div
            className="modalCard"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm delete upsell"
          >
            <div className="modalHeader">Delete upsell?</div>
            <div className="modalBody">
              <div className="modalTitle">Delete this upsell?</div>
              <div className="modalText">
                {deleteTarget.title
                  ? `"${deleteTarget.title}" will be permanently removed.`
                  : "This upsell will be permanently removed."}
              </div>
            </div>
            <div className="modalActions">
              <button className="cancelButton" onClick={onCancelDelete}>
                Cancel
              </button>
              <button className="confirmButton" onClick={onConfirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function StatCard({
  label,
  value,
  trend,
  onViewDetails,
}: {
  label: string;
  value: string;
  trend?: string;
  onViewDetails: () => void;
}) {
  return (
    <div className="statCard">
      <div className="statCardBody">
        <div className="statLabel">{label}</div>
        <div className="statValue">{value}</div>
        {trend && (
          <div className="statTrend">↑ {trend} vs prior period</div>
        )}
      </div>
      {/* Metric-card View Details links are intentionally hidden. */}
    </div>
  );
}

function BoltIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" fill="currentColor" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="12" width="4" height="8" rx="1" fill="currentColor" />
      <rect x="10" y="7" width="4" height="13" rx="1" fill="currentColor" />
      <rect x="16" y="3" width="4" height="17" rx="1" fill="currentColor" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
