import { useAppBridge } from "@shopify/app-bridge-react";
import { useState, useMemo } from "react";
import type { Offer as OfferRecord } from "@prisma/client";

import { PLACEMENT_LABELS, getOfferTypeConfig, placementHeaderLabel } from "../types/offer";
import { AdminAppLink } from "./AdminAppLink";

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
  createUrl: string;
  editUrl: (id: string) => string;
  onToggleStatus: (id: string) => void;
  onDelete: (id: string) => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onViewDetails: (section: string) => void;
  canCreate: boolean;
  analyticsUrl: string;
  allUpsellsUrl: string;
  offerAnalyticsUrl: (offerId: string) => string;
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
  createUrl,
  editUrl,
  onToggleStatus,
  onDelete,
  onConfirmDelete,
  onCancelDelete,
  onViewDetails,
  canCreate,
  analyticsUrl,
  allUpsellsUrl,
  offerAnalyticsUrl,
}: DashboardProps) {
  useAppBridge();

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

  function getPlacementBadgeInfo(offer: OfferRecord): { label: string; className: string } {
    const rules = (offer.triggerRules as Record<string, unknown> | null) ?? {};
    const displayLocation = typeof rules.displayLocation === "string" ? rules.displayLocation : undefined;

    if (displayLocation === "cart_drawer") {
      return { label: "Cart", className: "placementPillCart" };
    }
    if (displayLocation === "cart_drawer_upsell" || offer.placement === "cart_drawer") {
      return { label: "Cart Drawer", className: "placementPillCartDrawer" };
    }
    if (offer.placement === "product_page") {
      return { label: "Product Page", className: "placementPillProductPage" };
    }
    if (offer.placement === "post_purchase") {
      return { label: "Post-Purchase", className: "placementPillPostPurchase" };
    }
    if (offer.placement === "checkout") {
      return { label: "Checkout", className: "placementPillCheckout" };
    }
    if (offer.placement === "order_status") {
      return { label: "Order Status", className: "placementPillDefault" };
    }
    return { label: "Checkout", className: "placementPillCheckout" };
  }

  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "draft">("all");
  const [placementFilter, setPlacementFilter] = useState<string>("all");
  const [expandedTriggerOfferIds, setExpandedTriggerOfferIds] = useState<Record<string, boolean>>({});

  function toggleTriggerExpand(offerId: string) {
    setExpandedTriggerOfferIds((prev) => ({
      ...prev,
      [offerId]: !prev[offerId],
    }));
  }

  const [expandedSubtitleOfferIds, setExpandedSubtitleOfferIds] = useState<Record<string, boolean>>({});

  function toggleSubtitleExpand(offerId: string) {
    setExpandedSubtitleOfferIds((prev) => ({
      ...prev,
      [offerId]: !prev[offerId],
    }));
  }

  const filteredOffers = useMemo(() => {
    return visibleOffers.filter((offer) => {
      if (statusFilter !== "all" && offer.isActive !== (statusFilter === "active")) return false;
      if (placementFilter !== "all" && offer.placement !== placementFilter) return false;
      return true;
    });
  }, [visibleOffers, statusFilter, placementFilter]);

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
            {canCreate ? (
              <AdminAppLink
                to={createUrl}
                className="actionCard actionCardPrimary"
                style={{ textDecoration: "none", color: "inherit" }}
              >
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
              </AdminAppLink>
            ) : (
              <div className="actionCard actionCardPrimary" style={{ opacity: 0.55, cursor: "not-allowed" }} aria-disabled="true">
                <span className="actionIcon actionIconPrimary">
                  <BoltIcon />
                </span>
                <span className="actionCardText">
                  <span className="actionCardTitle">Create Upsell</span>
                  <span className="actionCardSubtitle actionCardSubtitlePrimary">
                    Offer limit reached. Upgrade to add more.
                  </span>
                </span>
              </div>
            )}

            <AdminAppLink
              to={analyticsUrl}
              className="actionCard"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <span className="actionIcon">
                <ChartIcon />
              </span>
              <span className="actionCardText">
                <span className="actionCardTitle">View Analytics</span>
                <span className="actionCardSubtitle">Funnel · Charts · Insights</span>
              </span>
              <span className="actionChevron">›</span>
            </AdminAppLink>

            <AdminAppLink to={allUpsellsUrl} className="actionCard" style={{ textDecoration: "none", color: "inherit" }}>
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
            </AdminAppLink>
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
                <AdminAppLink
                  to={offerAnalyticsUrl(topPerformer.id)}
                  className="featuredLink"
                  style={{ textDecoration: "none" }}
                >
                  View details →
                </AdminAppLink>
              </div>
            </div>
          )}

          <div id="active-upsells-section" className="tableSection">
            <div className="tableSectionHeader">
              <h2 className="sectionHeading">Active Upsells</h2>
              <div className="tableSectionHeaderRight">
                <div className="tableFilters">
                  <div className="filterGroup">
                    <span className="filterLabel">Placement</span>
                    <select
                      className="filterSelect"
                      value={placementFilter}
                      onChange={(e) => setPlacementFilter(e.target.value)}
                    >
                      <option value="all">All</option>
                      {Object.entries(PLACEMENT_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="filterGroup">
                    <span className="filterLabel">Status</span>
                    <select
                      className="filterSelect"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "draft")}
                    >
                      <option value="all">All Status</option>
                      <option value="active">Active</option>
                      <option value="draft">Draft</option>
                    </select>
                  </div>
                </div>
                <AdminAppLink
                  to={allUpsellsUrl}
                  className="viewAllLink"
                  style={{ textDecoration: "none" }}
                >
                  View all →
                </AdminAppLink>
              </div>
            </div>

            {filteredOffers.length === 0 ? (
              <div className="emptyCell">
                {visibleOffers.length === 0 ? "There are no data" : "No offers match your filters"}
              </div>
            ) : (
              <div className="offerList">
                <div className="offerRow offerRowHeader">
                  <div className="offerColHeader">Offer</div>
                  <div className="offerColHeader">Placement</div>
                  <div className="offerColHeader">Trigger / Applies To</div>
                  <div className="offerColHeader offerColHeaderBordered">Status</div>
                  <div className="offerColHeader offerColHeaderBordered">Conv. Rate</div>
                  <div className="offerColHeader offerColHeaderBordered">Purchases</div>
                  <div className="offerColHeader offerColHeaderBordered">Actions</div>
                </div>
                {filteredOffers.map((offer: OfferRecord) => {
                  const offerViews = offerIdToViews.get(offer.id) ?? 0;
                  const offerPurchases = offerIdToPurchases.get(offer.id) ?? 0;
                  const offerConvRate =
                    offerViews > 0 ? offerPurchases / offerViews : null;
                  const typeConfig = getOfferTypeConfig(offer.type);
                  const placementBadge = getPlacementBadgeInfo(offer);
                  const isPostPurchase = offer.placement === "post_purchase";
                  const targetIds = Array.isArray(offer.targetProductIds)
                    ? offer.targetProductIds.filter(Boolean)
                    : [];
                  const firstTriggerTitle =
                    targetIds.length > 0
                      ? productTitleByProductId[targetIds[0]] ?? targetIds[0]
                      : null;
                  const remainingTriggers = targetIds.length - 1;
                  const isTriggerExpanded = Boolean(expandedTriggerOfferIds[offer.id]);
                  const offerTitles = productTitlesForOffer(offer);
                  const isSubtitleExpanded = Boolean(expandedSubtitleOfferIds[offer.id]);

                  return (
                    <div key={offer.id} className="offerRow">
                      <div className="offerColDetails">
                        <div className="offerTitle">{offer.name}</div>
                        {isSubtitleExpanded ? (
                          <div className="offerSubtitleContent offerSubtitleExpanded">
                            <div className="offerSubtitleList">
                              {offerTitles.map((t, idx) => (
                                <span key={idx} className="offerSubtitleItem">
                                  {t}
                                </span>
                              ))}
                            </div>
                            <button
                              type="button"
                              className="offerCollapseLink"
                              onClick={() => toggleSubtitleExpand(offer.id)}
                            >
                              Show less
                            </button>
                          </div>
                        ) : (
                          <div className="offerSubtitle">
                            {offerTitles.length > 2 ? (
                              <>
                                <span>for {offerTitles[0]} </span>
                                <button
                                  type="button"
                                  className="offerMoreLink"
                                  onClick={() => toggleSubtitleExpand(offer.id)}
                                >
                                  +{offerTitles.length - 1}
                                </button>
                              </>
                            ) : (
                              subtitleForOffer(offer)
                            )}
                          </div>
                        )}
                      </div>

                      <div className="offerColPlacement">
                        <div className="placementPillGroup">
                          <span className={isPostPurchase ? "typePill typePillPurple" : "typePill"}>
                            {typeConfig.label}
                          </span>
                          <span className={`placementPill ${placementBadge.className}`}>
                            {placementBadge.label}
                          </span>
                        </div>
                      </div>

                      <div className="offerColTrigger">
                        {firstTriggerTitle ? (
                          <div className={`triggerCellContent ${isTriggerExpanded ? "triggerCellExpanded" : ""}`}>
                            {isTriggerExpanded ? (
                              <>
                                {targetIds.map((pid) => (
                                  <span key={pid} className="triggerPrimaryText">
                                    {productTitleByProductId[pid] ?? pid}
                                  </span>
                                ))}
                                <button
                                  type="button"
                                  className="triggerCollapseBtn"
                                  onClick={() => toggleTriggerExpand(offer.id)}
                                >
                                  Show less
                                </button>
                              </>
                            ) : (
                              <>
                                <span className="triggerPrimaryText" title={firstTriggerTitle}>
                                  {firstTriggerTitle}
                                </span>
                                {remainingTriggers > 0 && (
                                  <button
                                    type="button"
                                    className="triggerMoreBtn"
                                    onClick={() => toggleTriggerExpand(offer.id)}
                                  >
                                    +{remainingTriggers} more
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        ) : (
                          <div className="triggerCellContent">
                            <span className="triggerPrimaryText">All Products</span>
                          </div>
                        )}
                      </div>

                      <div className="offerColStatus">
                        <span className={offer.isActive ? "statusPill statusPillActive" : "statusPill statusPillDraft"}>
                          {offer.isActive ? "Active" : "Draft"}
                        </span>
                      </div>

                      <div className="offerColStat">
                        <span className="offerStatNumber">
                          {formatPercent(offerConvRate)}
                        </span>
                      </div>

                      <div className="offerColStat">
                        <span className="offerStatNumber">
                          {formatCompact(offerPurchases)}
                        </span>
                      </div>

                      <div className="offerColActions">
                        <AdminAppLink to={editUrl(offer.id)} className="actionBtn actionBtnEdit" style={{ textDecoration: "none" }}>
                          Edit
                        </AdminAppLink>
                        <button
                          type="button"
                          className={
                            deletingId === offer.id
                              ? "actionBtn actionBtnDisabled"
                              : "actionBtn actionBtnDelete"
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
