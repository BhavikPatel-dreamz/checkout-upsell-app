import { useEffect, useMemo, useRef, useState } from "react";
import { useLoaderData, type LoaderFunctionArgs } from "react-router";

import { authenticate } from "../shopify.server";
import { listOffers } from "../models/offer.server";
import { findVariantsByProductIds } from "../models/productVariant.server";
import {
  getOfferPurchaseMetrics,
  getOfferRevenueByOffer,
  getOfferViewMetrics,
} from "../models/offerAnalytics.server";
import { AdminAppLink } from "../components/AdminAppLink";
import "../styles/app._index.css";
import "../styles/upsells.css";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const offers = await listOffers(session.shop);

  let currencyCode = "USD";
  try {
    const shopResponse = await admin.graphql(`
      #graphql
      query ShopCurrency {
        shop {
          currencyCode
        }
      }
    `);
    const shopJson = (await shopResponse.json()) as {
      data?: { shop?: { currencyCode?: string } };
    };
    if (shopJson?.data?.shop?.currencyCode) {
      currencyCode = shopJson.data.shop.currencyCode;
    }
  } catch (error) {
    console.warn("[AllUpsells] Failed to query shop currency", error);
  }

  let currencySymbol = "$";
  try {
    const parts = new Intl.NumberFormat(currencyCode === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency: currencyCode,
    }).formatToParts(0);
    const currencyPart = parts.find((p) => p.type === "currency");
    if (currencyPart) {
      currencySymbol = currencyPart.value;
    }
  } catch {
    currencySymbol = "$";
  }

  const productIdsSet = new Set<string>();
  for (const offer of offers) {
    if (Array.isArray(offer.targetProductIds)) {
      for (const id of offer.targetProductIds) {
        if (id) productIdsSet.add(id);
      }
    }
    try {
      const rules = (offer.triggerRules as Record<string, unknown>) ?? {};
      const selection = (rules.productSelection as { items?: unknown } | undefined) ?? null;
      const manualSelections = (rules.manualSelections as unknown[] | undefined) ?? [];
      const items = Array.isArray(selection?.items)
        ? (selection.items as Array<{ productId?: unknown }>)
        : Array.isArray(manualSelections)
          ? (manualSelections as Array<{ productId?: unknown }>)
          : [];
      for (const it of items) {
        if (it && typeof it.productId === "string") {
          productIdsSet.add(it.productId);
        }
      }
    } catch {
      // ignore
    }
  }

  const [productRows, views, purchases, revenue] = await Promise.all([
    findVariantsByProductIds(session.shop, Array.from(productIdsSet)),
    getOfferViewMetrics(session.shop),
    getOfferPurchaseMetrics(session.shop),
    getOfferRevenueByOffer(session.shop),
  ]);

  const productTitleById: Record<string, string> = {};
  const productImageById: Record<string, string> = {};

  for (const row of productRows) {
    if (row.productId) {
      if (row.productTitle && !productTitleById[row.productId]) {
        productTitleById[row.productId] = row.productTitle;
      }
      if (row.imageUrl && !productImageById[row.productId]) {
        productImageById[row.productId] = row.imageUrl;
      }
    }
  }

  return {
    offers,
    productTitleById,
    productImageById,
    views,
    purchases,
    revenue,
    currencyCode,
    currencySymbol,
  };
}

const formatNumber = (value: number) => new Intl.NumberFormat("en-US").format(value);
const formatRevenue = (value: number, currency = "USD") => {
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
};

const PAGE_SIZE = 10;

export default function AllUpsellsPage() {
  const {
    offers,
    productTitleById,
    productImageById,
    views,
    purchases,
    revenue,
    currencyCode,
    currencySymbol,
  } = useLoaderData<typeof loader>();
  const [visibleOffers, setVisibleOffers] = useState(offers);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "draft">("all");
  const [placementFilter, setPlacementFilter] = useState("all");
  const [offerTypeFilter, setOfferTypeFilter] = useState("all");
  const [dateRange, setDateRange] = useState("30");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);

  // Close 3-dots menu when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function toggleOfferStatus(id: string) {
    const offer = visibleOffers.find((item) => item.id === id);
    if (!offer) return;

    setTogglingId(id);
    try {
      const response = await fetch(`/api/offers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !offer.isActive }),
      });

      if (!response.ok) return;

      setVisibleOffers((current) =>
        current.map((item) => (item.id === id ? { ...item, isActive: !item.isActive } : item)),
      );
    } finally {
      setTogglingId((current) => (current === id ? null : current));
    }
  }

  async function deleteOffer(id: string) {
    if (!confirm("Are you sure you want to delete this upsell offer?")) return;
    try {
      const response = await fetch(`/api/offers/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) return;
      setVisibleOffers((current) => current.filter((item) => item.id !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (e) {
      console.error("Failed to delete offer", e);
    }
  }

  async function deleteSelectedOffers() {
    const count = selectedIds.size;
    if (count === 0) return;
    if (!confirm(`Are you sure you want to delete ${count} upsell offer${count > 1 ? "s" : ""}?`)) return;
    try {
      for (const id of selectedIds) {
        const response = await fetch(`/api/offers/${id}`, { method: "DELETE" });
        if (!response.ok) continue;
      }
      setVisibleOffers((current) => current.filter((item) => !selectedIds.has(item.id)));
      setSelectedIds(new Set());
    } catch (e) {
      console.error("Failed to delete selected offers", e);
    }
  }

  const viewsByOffer = useMemo(
    () => new Map(views.offerBreakdown.map((item) => [item.offerId, item.views])),
    [views.offerBreakdown],
  );
  const purchasesByOffer = useMemo(
    () => new Map(purchases.offerBreakdown.map((item) => [item.offerId, item.purchases])),
    [purchases.offerBreakdown],
  );
  const revenueByOffer = useMemo(
    () => new Map(revenue.map((item) => [item.offerId, item.revenue])),
    [revenue],
  );

  // Real KPIs
  const totalUpsells = visibleOffers.length;
  const activeUpsells = useMemo(
    () => visibleOffers.filter((o) => o.isActive).length,
    [visibleOffers],
  );
  const totalPurchases = purchases.totalPurchases ?? 0;
  const totalRevenue = useMemo(
    () => revenue.reduce((sum, item) => sum + (item.revenue ?? 0), 0),
    [revenue],
  );

  function getOfferProductInfo(offer: (typeof offers)[number]) {
    // Check targetProductIds first
    if (Array.isArray(offer.targetProductIds)) {
      for (const pid of offer.targetProductIds) {
        if (productTitleById[pid]) {
          return {
            title: productTitleById[pid],
            image: productImageById[pid] || null,
          };
        }
      }
    }

    // Check triggerRules
    try {
      const rules = (offer.triggerRules as Record<string, unknown>) ?? {};
      const manualSelections =
        (rules.manualSelections as Array<{
          productId?: string;
          productTitle?: string;
          imageUrl?: string;
        }>) ?? [];
      if (manualSelections.length > 0) {
        const it = manualSelections[0];
        const pid = it.productId;
        if (pid && productTitleById[pid]) {
          return {
            title: productTitleById[pid],
            image: productImageById[pid] || it.imageUrl || null,
          };
        }
        if (it.productTitle) {
          return {
            title: it.productTitle,
            image: it.imageUrl || null,
          };
        }
      }
    } catch {
      // ignore
    }

    const fallbackId = offer.targetProductIds?.[0];
    return {
      title: fallbackId
        ? productTitleById[fallbackId] ?? "Product unavailable"
        : "No trigger product selected",
      image: fallbackId ? productImageById[fallbackId] ?? null : null,
    };
  }

  // Filtered rows
  const filteredRows = useMemo(() => {
    return visibleOffers
      .map((offer) => {
        const productInfo = getOfferProductInfo(offer);
        const offerViews = viewsByOffer.get(offer.id) ?? 0;
        const offerPurchases = purchasesByOffer.get(offer.id) ?? 0;
        return {
          offer,
          productTitle: productInfo.title,
          productImage: productInfo.image,
          purchases: offerPurchases,
          conversionRate: offerViews > 0 ? offerPurchases / offerViews : null,
          revenue: revenueByOffer.get(offer.id) ?? 0,
        };
      })
      .filter(({ offer, productTitle }) => {
        // Status filter
        if (statusFilter === "active" && !offer.isActive) return false;
        if (statusFilter === "draft" && offer.isActive) return false;

        // Placement filter
        if (placementFilter !== "all" && offer.placement !== placementFilter) return false;

        // Offer type filter
        if (offerTypeFilter !== "all" && offer.type !== offerTypeFilter) return false;

        // Search query
        if (query.trim()) {
          const s = query.trim().toLowerCase();
          const nameMatch = offer.name.toLowerCase().includes(s);
          const productMatch = productTitle.toLowerCase().includes(s);
          if (!nameMatch && !productMatch) return false;
        }

        return true;
      });
  }, [
    visibleOffers,
    productTitleById,
    productImageById,
    purchasesByOffer,
    viewsByOffer,
    revenueByOffer,
    query,
    statusFilter,
    placementFilter,
    offerTypeFilter,
  ]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [query, statusFilter, placementFilter, offerTypeFilter]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, currentPage]);

  const allPageIdsSelected =
    paginatedRows.length > 0 && paginatedRows.every((r) => selectedIds.has(r.offer.id));

  function toggleSelectAll() {
    if (allPageIdsSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginatedRows.forEach((r) => next.delete(r.offer.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginatedRows.forEach((r) => next.add(r.offer.id));
        return next;
      });
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const totalCount = filteredRows.length;
  const startIdx = totalCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(totalCount, currentPage * PAGE_SIZE);
  const footerText =
    totalCount === 1
      ? "Showing 1 of 1 upsell"
      : totalCount === 0
        ? "Showing 0 upsells"
        : `Showing ${startIdx} to ${endIdx} of ${totalCount} upsells`;

  return (
    <div className="appPageShell allUpsellsShell" ref={menuContainerRef}>
      <main className="appPageContent allUpsellsContent">
        {/* Header */}
        <header className="allUpsellsHeader">
          <div>
            <h1>All Upsells</h1>
            <p>Create and manage your product upsell offers to increase revenue.</p>
          </div>
          <AdminAppLink to="/app/offers/new" className="allUpsellsNewButton">
            <PlusIcon /> New Upsell
          </AdminAppLink>
        </header>

        {/* 4 KPI Stat Cards */}
        <section className="kpiGrid" aria-label="Key Performance Indicators">
          {/* 1. Total Upsells */}
          <div className="kpiCard">
            <div className="kpiCardLeft">
              <div className="kpiIconWrap green">
                <ShoppingBagIcon />
              </div>
              <div className="kpiInfo">
                <div className="kpiLabel">Total Upsells</div>
                <div className="kpiValue">{totalUpsells}</div>
                <div className="kpiTrend">
                  <span className="kpiTrendPositive">↑ 0%</span>
                  <span className="kpiTrendPeriod">from last 30 days</span>
                </div>
              </div>
            </div>
            <div className="kpiSparkline">
              <GreenSparkline />
            </div>
          </div>

          {/* 2. Active Upsells */}
          <div className="kpiCard">
            <div className="kpiCardLeft">
              <div className="kpiIconWrap blue">
                <BoxCubeIcon />
              </div>
              <div className="kpiInfo">
                <div className="kpiLabel">Active Upsells</div>
                <div className="kpiValue">{activeUpsells}</div>
                <div className="kpiTrend">
                  <span className="kpiTrendPositive">↑ 0%</span>
                  <span className="kpiTrendPeriod">from last 30 days</span>
                </div>
              </div>
            </div>
            <div className="kpiSparkline">
              <BlueSparkline />
            </div>
          </div>

          {/* 3. Total Purchases */}
          <div className="kpiCard">
            <div className="kpiCardLeft">
              <div className="kpiIconWrap purple">
                <CartIcon />
              </div>
              <div className="kpiInfo">
                <div className="kpiLabel">Total Purchases</div>
                <div className="kpiValue">{formatNumber(totalPurchases)}</div>
                <div className="kpiTrend">
                  <span className="kpiTrendPositive">↑ 0%</span>
                  <span className="kpiTrendPeriod">from last 30 days</span>
                </div>
              </div>
            </div>
            <div className="kpiSparkline">
              <PurpleSparkline />
            </div>
          </div>

          {/* 4. Total Revenue */}
          <div className="kpiCard">
            <div className="kpiCardLeft">
              <div className="kpiIconWrap amber">
                <CurrencyCoinIcon symbol={currencySymbol} />
              </div>
              <div className="kpiInfo">
                <div className="kpiLabel">Total Revenue</div>
                <div className="kpiValue">{formatRevenue(totalRevenue, currencyCode)}</div>
                <div className="kpiTrend">
                  <span className="kpiTrendPositive">↑ 0%</span>
                  <span className="kpiTrendPeriod">from last 30 days</span>
                </div>
              </div>
            </div>
            <div className="kpiSparkline">
              <AmberSparkline />
            </div>
          </div>
        </section>

        {/* Search & Filter Bar */}
        <section className="allUpsellsFilterBar" aria-label="Search and filter upsells">
          <div className="allUpsellsSearchWrap">
            <SearchIcon />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search upsells or main products..."
              aria-label="Search upsells or main products"
            />
          </div>

          <div className="allUpsellsFiltersGroup">
            {/* Status Filter */}
            <div className="filterSelectWrap">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "draft")}
                aria-label="Filter by status"
              >
                <option value="all">Status</option>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
              </select>
              <span className="filterChevron">
                <ChevronDownIcon />
              </span>
            </div>

            {/* Placement Filter */}
            <div className="filterSelectWrap">
              <select
                value={placementFilter}
                onChange={(e) => setPlacementFilter(e.target.value)}
                aria-label="Filter by placement"
              >
                <option value="all">Placement</option>
                <option value="checkout">Checkout page</option>
                <option value="post_purchase">Post-purchase</option>
                <option value="product_page">Product page</option>
                <option value="cart_drawer">Cart drawer</option>
              </select>
              <span className="filterChevron">
                <ChevronDownIcon />
              </span>
            </div>

            {/* Offer Type Filter */}
            <div className="filterSelectWrap">
              <select
                value={offerTypeFilter}
                onChange={(e) => setOfferTypeFilter(e.target.value)}
                aria-label="Filter by offer type"
              >
                <option value="all">Offer type</option>
                <option value="cross_sell">Product Upsell</option>
                <option value="bundle">Bundle</option>
                <option value="volume">Quantity Discount</option>
                <option value="free_gift">Free Gift</option>
                <option value="subscription">Subscription</option>
              </select>
              <span className="filterChevron">
                <ChevronDownIcon />
              </span>
            </div>

            {/* Date Range Filter */}
            <div className="filterSelectWrap hasPrefix">
              <span className="filterPrefixIcon">
                <CalendarIcon />
              </span>
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                aria-label="Filter by date range"
              >
                <option value="30">Last 30 days</option>
                <option value="7">Last 7 days</option>
                <option value="90">Last 90 days</option>
                <option value="all">All time</option>
              </select>
              <span className="filterChevron">
                <ChevronDownIcon />
              </span>
            </div>

            {/* Bulk Delete Button */}
            {selectedIds.size > 0 && (
              <button
                type="button"
                className="bulkDeleteBtn"
                onClick={deleteSelectedOffers}
                aria-label={`Delete ${selectedIds.size} selected upsell${selectedIds.size > 1 ? "s" : ""}`}
              >
                <TrashIcon /> Delete {selectedIds.size} selected
              </button>
            )}
          </div>
        </section>

        {/* Table Card */}
        <section className="allUpsellsTableCard" aria-label="All upsells list">
          <div className="tableScrollContainer">
            {/* Table Header */}
            <div className="tableGrid tableHeadRow">
              <div>
                <input
                  type="checkbox"
                  className="tableCheckbox"
                  checked={allPageIdsSelected}
                  onChange={toggleSelectAll}
                  aria-label="Select all upsells on this page"
                />
              </div>
              <div>Upsell Offer</div>
              <div>Placement</div>
              <div>Offer Type</div>
              <div>Status</div>
              <div>Purchases</div>
              <div>Conv. Rate</div>
              <div>Revenue</div>
              <div>Actions</div>
            </div>

            {/* Table Body */}
            {paginatedRows.length === 0 ? (
              <div className="tableEmpty">No upsells match your filters.</div>
            ) : (
              paginatedRows.map(
                ({
                  offer,
                  productTitle,
                  productImage,
                  purchases: offerPurchases,
                  conversionRate,
                  revenue: offerRevenue,
                }) => {
                  const placement = getPlacementDetails(offer.placement);
                  const isChecked = selectedIds.has(offer.id);

                  return (
                    <div key={offer.id} className="tableGrid tableDataRow">
                      {/* 1. Checkbox */}
                      <div>
                        <input
                          type="checkbox"
                          className="tableCheckbox"
                          checked={isChecked}
                          onChange={() => toggleSelect(offer.id)}
                          aria-label={`Select ${offer.name}`}
                        />
                      </div>

                      {/* 2. Upsell Offer */}
                      <div className="offerCell">
                        <div className="offerMeta">
                          <strong className="offerTitle">{offer.name}</strong>
                          <span className="offerProduct">for {productTitle}</span>
                        </div>
                      </div>

                      {/* 3. Placement */}
                      <div>
                        <span className={`placementPill ${placement.className}`}>
                          {placement.icon} {placement.label}
                        </span>
                      </div>

                      {/* 4. Offer Type */}
                      <div>
                        <span className="offerTypePill">
                          <SparklesIcon /> {getOfferTypeLabel(offer.type)}
                        </span>
                      </div>

                      {/* 5. Status */}
                      <div className="statusCell">
                        <span className={`statusPill ${offer.isActive ? "active" : "draft"}`}>
                          <span className="statusDot" />
                          {offer.isActive ? "Active" : "Draft"}
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={offer.isActive}
                          className={`iosToggle ${offer.isActive ? "on" : "off"}`}
                          onClick={() => toggleOfferStatus(offer.id)}
                          disabled={togglingId === offer.id}
                          title={offer.isActive ? "Deactivate offer" : "Activate offer"}
                        >
                          <span className="iosToggleKnob" />
                        </button>
                      </div>

                      {/* 6. Purchases */}
                      <div className="tableValueBold">{formatNumber(offerPurchases)}</div>

                      {/* 7. Conv. Rate */}
                      <div className="tableValueMuted">
                        {conversionRate == null ? "—" : `${(conversionRate * 100).toFixed(1)}%`}
                      </div>

                      {/* 8. Revenue */}
                      <div className="tableValueBold">{formatRevenue(offerRevenue, currencyCode)}</div>

                      {/* 9. Actions */}
                      <div className="actionsWrap">
                        <AdminAppLink
                          to={`/app/analytics/${encodeURIComponent(offer.id)}`}
                          className="actionBtn"
                        >
                          <ChartIcon /> View Analytics
                        </AdminAppLink>
                        <AdminAppLink
                          to={`/app/offers/new?id=${encodeURIComponent(offer.id)}`}
                          className="actionBtn"
                        >
                          <PencilIcon /> Edit
                        </AdminAppLink>
                        <div style={{ position: "relative" }}>
                          <button
                            type="button"
                            className="actionMenuBtn"
                            onClick={() =>
                              setOpenMenuId(openMenuId === offer.id ? null : offer.id)
                            }
                            aria-label={`More actions for ${offer.name}`}
                          >
                            <MoreDotsIcon />
                          </button>
                          {openMenuId === offer.id && (
                            <div className="actionPopover">
                              <AdminAppLink
                                to={`/app/analytics/${encodeURIComponent(offer.id)}`}
                                className="actionPopoverItem"
                                onClick={() => setOpenMenuId(null)}
                              >
                                <ChartIcon /> View Analytics
                              </AdminAppLink>
                              <AdminAppLink
                                to={`/app/offers/new?id=${encodeURIComponent(offer.id)}`}
                                className="actionPopoverItem"
                                onClick={() => setOpenMenuId(null)}
                              >
                                <PencilIcon /> Edit Offer
                              </AdminAppLink>
                              <button
                                type="button"
                                className="actionPopoverItem delete"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  deleteOffer(offer.id);
                                }}
                              >
                                <TrashIcon /> Delete Offer
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }
              )
            )}
          </div>

          {/* Table Footer / Pagination */}
          <footer className="tableFooter">
            <span className="tableFooterText">{footerText}</span>
            <div className="paginationControls">
              <button
                type="button"
                className="pageBtn"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
              >
                <ChevronLeftIcon />
              </button>
              <button type="button" className="pageBtn active" aria-current="page">
                {currentPage}
              </button>
              <button
                type="button"
                className="pageBtn"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                aria-label="Next page"
              >
                <ChevronRightIcon />
              </button>
            </div>
          </footer>
        </section>
      </main>
    </div>
  );
}

// =========================================================================
// Helpers & Icons
// =========================================================================

function getPlacementDetails(placement: string) {
  switch (placement) {
    case "checkout":
      return { label: "Checkout page", className: "checkout", icon: <CartIcon /> };
    case "post_purchase":
      return { label: "Post-purchase", className: "postPurchase", icon: <PackageIcon /> };
    case "product_page":
      return { label: "Product page", className: "productPage", icon: <TagIcon /> };
    case "cart_drawer":
      return { label: "Cart drawer", className: "cartDrawer", icon: <DrawerIcon /> };
    default:
      return {
        label: placement ? placement.replace(/_/g, " ") : "Checkout page",
        className: "default",
        icon: <CartIcon />,
      };
  }
}

function getOfferTypeLabel(type: string) {
  switch (type) {
    case "cross_sell":
      return "Product Upsell";
    case "bundle":
      return "Bundle";
    case "volume":
      return "Quantity Discount";
    case "free_gift":
      return "Free Gift";
    case "subscription":
      return "Subscription";
    case "ai_recommend":
      return "AI Recommendation";
    default:
      return type ? type.replace(/_/g, " ") : "Product Upsell";
  }
}

function PlusIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M8 2.5V13.5M2.5 8H13.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ShoppingBagIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

function BoxCubeIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m21 8-9-5-9 5v8l9 5 9-5Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 12v10" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="21" r="1" />
      <circle cx="19" cy="21" r="1" />
      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
    </svg>
  );
}

function CurrencyCoinIcon({ symbol = "$" }: { symbol?: string }) {
  if (symbol === "$") {
    return (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
        <path d="M12 6v12" />
      </svg>
    );
  }

  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <text
        x="12"
        y="12.5"
        textAnchor="middle"
        dominantBaseline="central"
        fill="currentColor"
        stroke="none"
        fontSize={symbol.length > 1 ? "10" : "12"}
        fontWeight="700"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
      >
        {symbol}
      </text>
    </svg>
  );
}

function GreenSparkline() {
  return (
    <svg width="76" height="34" viewBox="0 0 76 34" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="greenGrad" x1="0" y1="0" x2="0" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#10b981" stopOpacity="0.25" />
          <stop offset="1" stopColor="#10b981" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M1 28C14 26 22 28 32 24C42 20 48 25 58 18C65 13 71 14 75 12"
        stroke="#10b981"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M1 28C14 26 22 28 32 24C42 20 48 25 58 18C65 13 71 14 75 12V34H1V28Z"
        fill="url(#greenGrad)"
      />
    </svg>
  );
}

function BlueSparkline() {
  return (
    <svg width="76" height="34" viewBox="0 0 76 34" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3b82f6" stopOpacity="0.25" />
          <stop offset="1" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M1 28C12 28 20 25 30 22C40 18 46 24 56 16C64 10 70 14 75 12"
        stroke="#3b82f6"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M1 28C12 28 20 25 30 22C40 18 46 24 56 16C64 10 70 14 75 12V34H1V28Z"
        fill="url(#blueGrad)"
      />
    </svg>
  );
}

function PurpleSparkline() {
  return (
    <svg width="76" height="34" viewBox="0 0 76 34" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="purpleGrad" x1="0" y1="0" x2="0" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8b5cf6" stopOpacity="0.25" />
          <stop offset="1" stopColor="#8b5cf6" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M1 28C14 27 22 29 32 25C42 20 48 24 58 17C65 12 70 15 75 13"
        stroke="#8b5cf6"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M1 28C14 27 22 29 32 25C42 20 48 24 58 17C65 12 70 15 75 13V34H1V28Z"
        fill="url(#purpleGrad)"
      />
    </svg>
  );
}

function AmberSparkline() {
  return (
    <svg width="76" height="34" viewBox="0 0 76 34" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="amberGrad" x1="0" y1="0" x2="0" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f59e0b" stopOpacity="0.25" />
          <stop offset="1" stopColor="#f59e0b" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M1 27C12 27 20 24 30 21C40 17 46 23 56 15C64 11 70 14 75 12"
        stroke="#f59e0b"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M1 27C12 27 20 24 30 21C40 17 46 23 56 15C64 11 70 14 75 12V34H1V27Z"
        fill="url(#amberGrad)"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function ProductPlaceholderIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#94a3b8"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  );
}

function PackageIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m7.5 4.27 9 5.15" />
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
      <circle cx="7" cy="7" r="1.5" />
    </svg>
  );
}

function DrawerIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="20" height="12" x="2" y="6" rx="2" />
      <path d="M10 12h4" />
    </svg>
  );
}

function SparklesIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

function MoreDotsIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="19" r="1" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
    </svg>
  );
}
