import { useState, useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  useLoaderData,
  useSearchParams,
  useLocation,
  type LoaderFunctionArgs,
} from "react-router";
import type { Offer as OfferRecord } from "@prisma/client";

import { authenticate } from "../shopify.server";
import { listOffers } from "../models/offer.server";
import {
  getOfferViewMetrics,
  getOfferClickMetrics,
  getOfferAddedToCartMetrics,
  getOfferPurchaseMetrics,
} from "../models/offerAnalytics.server";
import { findVariantsByProductIds } from "../models/productVariant.server";
import Dashboard from "../components/Dashboard";
import "../styles/app._index.css";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const offers = await listOffers(session.shop);

  // Collect productIds referenced by offers (productSelection or targetProductIds)
  const productIds = new Set<string>();
  for (const o of offers) {
    try {
      const rules = (o.triggerRules as Record<string, unknown>) ?? {};
      const selection =
        (rules.productSelection as { items?: unknown } | undefined) ?? null;
      const manualSelections = (rules.manualSelections as unknown[] | undefined) ?? [];
      const items = Array.isArray(selection?.items)
        ? (selection.items as Array<{ productId?: unknown }>)
        : Array.isArray(manualSelections)
          ? (manualSelections as Array<{ productId?: unknown }>)
          : [];
      for (const it of items) {
        if (it && typeof it.productId === "string") productIds.add(it.productId);
      }
    } catch (e) {
      // ignore malformed triggerRules
    }
    if (Array.isArray(o.targetProductIds)) {
      for (const pid of o.targetProductIds) if (typeof pid === "string") productIds.add(pid);
    }
  }

  const productRows = await findVariantsByProductIds(session.shop, Array.from(productIds));
  const productTitleByProductId: Record<string, string> = {};
  for (const r of productRows) {
    if (r.productId && r.productTitle) productTitleByProductId[r.productId] = r.productTitle;
  }

  const [viewMetrics, clickMetrics, addedToCartMetrics, purchaseMetrics] =
    await Promise.all([
      getOfferViewMetrics(session.shop),
      getOfferClickMetrics(session.shop),
      getOfferAddedToCartMetrics(session.shop),
      getOfferPurchaseMetrics(session.shop),
    ]);

  return {
    offers,
    productTitleByProductId,
    metrics: viewMetrics,
    clickMetrics,
    addedToCartMetrics,
    purchaseMetrics,
  };
}

export default function OffersPage() {
  const location = useLocation();
  const {
    offers,
    productTitleByProductId,
    metrics,
    clickMetrics,
    addedToCartMetrics,
    purchaseMetrics,
  } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const [visibleOffers, setVisibleOffers] = useState(offers);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"Dashboard" | "Help">("Dashboard");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setVisibleOffers(offers);
  }, [offers]);

  // derive product titles per offer on the client from loader-provided maps
  function productTitlesForOffer(offer: OfferRecord) {
    const titles: string[] = [];
    try {
      const rules = (offer.triggerRules as Record<string, unknown>) ?? {};
      const selection =
        (rules.productSelection as { items?: unknown } | undefined) ?? null;
      const manualSelections = (rules.manualSelections as unknown[] | undefined) ?? [];
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

  const totalViews = metrics.totalViews;
  const totalAdded = 0;
  const activeCount = visibleOffers.filter((o) => Boolean(o.isActive)).length;

  function editUpsellUrl(id: string) {
    const params = new URLSearchParams(location.search);
    params.set("id", id);
    params.delete("type");
    const suffix = params.toString();
    return `/app/offers/new${suffix ? `?${suffix}` : ""}`;
  }

  function createNewOfferUrl() {
    const params = new URLSearchParams(location.search);
    params.delete("id");
    params.delete("type");
    const suffix = params.toString();

    if (typeof window !== "undefined") {
      const appIdx = window.location.pathname.lastIndexOf("/app");
      if (appIdx !== -1) {
        const appBase = `${window.location.origin}${window.location.pathname.slice(0, appIdx + 4)}`;
        return `${appBase}/offers/new${suffix ? `?${suffix}` : ""}`;
      }
    }

    return `/app/offers/new${suffix ? `?${suffix}` : ""}`;
  }


  async function toggleStatus(id: string) {
    const offer = offers.find((item) => item.id === id);
    if (!offer) return;

    const response = await fetch(`/api/offers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !offer.isActive }),
    });

    if (!response.ok) {
      showToast("Failed to update the offer status");
      return;
    }

    const newActive = !offer.isActive;
    showToast(newActive ? "Upsell activated successfully." : "Upsell deactivated successfully.");
    window.location.reload();
  }

  async function deleteUpsell(id: string) {
    if (!id) {
      showToast("Offer ID is required.");
      return;
    }

    const offer = visibleOffers.find((item) => item.id === id);
    if (!offer) {
      showToast("Offer not found.");
      return;
    }

    setDeleteTarget({ id, title: offer.name ?? "this upsell" });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;

    const { id } = deleteTarget;
    setDeletingId(id);

    try {
      const response = await fetch(`/api/offers/${id}`, { method: "DELETE" });

      if (!response.ok) {
        showToast("Failed to delete the offer");
        return;
      }

      setVisibleOffers((current) => current.filter((offer) => offer.id !== id));
      setDeleteTarget(null);
      showToast("Upsell deleted successfully.");
    } finally {
      setDeletingId((current) => (current === id ? null : current));
    }
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2200);
  }

  // Close the delete-confirmation modal with the Escape key.
  useEffect(() => {
    if (!deleteTarget) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setDeleteTarget(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteTarget]);

  // Show toast for newly created offers redirected here with ?created=1
  useEffect(() => {
    const created = searchParams.get("created");
    if (created) {
      showToast("Upsell created successfully.");
      const url = new URL(window.location.href);
      url.searchParams.delete("created");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function viewDetails(section: string) {
    document
      .getElementById("active-upsells-section")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    showToast(`Showing details for: ${section}`);
  }

  return (
    <Dashboard
      productTitleByProductId={productTitleByProductId}
      metrics={metrics}
      clickMetrics={clickMetrics}
      addedToCartMetrics={addedToCartMetrics}
      purchaseMetrics={purchaseMetrics}
      visibleOffers={visibleOffers}
      deletingId={deletingId}
      deleteTarget={deleteTarget}
      activeTab={activeTab}
      toast={toast}
      onActiveTabChange={setActiveTab}
      createUrl={createNewOfferUrl()}
      editUrl={editUpsellUrl}
      onToggleStatus={toggleStatus}
      onDelete={deleteUpsell}
      onConfirmDelete={confirmDelete}
      onCancelDelete={() => setDeleteTarget(null)}
      onViewDetails={viewDetails}
      analyticsUrl="/app/analytics"
      allUpsellsUrl="/app/upsells"
      offerAnalyticsUrl={(offerId) => `/app/analytics/${encodeURIComponent(offerId)}`}
    />
  );
}
