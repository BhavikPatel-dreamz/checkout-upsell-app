import { useMemo, useState } from "react";
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
  const { session } = await authenticate.admin(request);
  const offers = await listOffers(session.shop);
  const productIds = offers.flatMap((offer) => offer.targetProductIds).filter(Boolean);
  const [productRows, views, purchases, revenue] = await Promise.all([
    findVariantsByProductIds(session.shop, productIds),
    getOfferViewMetrics(session.shop),
    getOfferPurchaseMetrics(session.shop),
    getOfferRevenueByOffer(session.shop),
  ]);

  const productTitleById = Object.fromEntries(
    productRows.map((row) => [row.productId, row.productTitle]),
  );

  return { offers, productTitleById, views, purchases, revenue };
}

const formatNumber = (value: number) => new Intl.NumberFormat("en-US").format(value);
const formatRevenue = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);

export default function AllUpsellsPage() {
  const { offers, productTitleById, views, purchases, revenue } = useLoaderData<typeof loader>();
  const [visibleOffers, setVisibleOffers] = useState(offers);
  const [query, setQuery] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);

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

  const rows = useMemo(
    () =>
      visibleOffers
        .map((offer) => {
          const productTitle = offer.targetProductIds
            .map((productId) => productTitleById[productId])
            .find(Boolean) ?? "No trigger product selected";
          const offerViews = viewsByOffer.get(offer.id) ?? 0;
          const offerPurchases = purchasesByOffer.get(offer.id) ?? 0;
          return {
            offer,
            productTitle,
            purchases: offerPurchases,
            conversionRate: offerViews > 0 ? offerPurchases / offerViews : null,
            revenue: revenueByOffer.get(offer.id) ?? 0,
          };
        })
        .filter(({ offer, productTitle }) => {
          const search = query.trim().toLowerCase();
          return !search || offer.name.toLowerCase().includes(search) || productTitle.toLowerCase().includes(search);
        }),
    [visibleOffers, productTitleById, purchasesByOffer, query, revenueByOffer, viewsByOffer],
  );

  return (
    <div className="appPageShell allUpsellsShell">
      <main className="appPageContent allUpsellsContent">
        <header className="allUpsellsHeader">
          <div>
            <h1>All Upsells</h1>
            <p>{visibleOffers.length} offer{visibleOffers.length === 1 ? "" : "s"} configured</p>
          </div>
          <AdminAppLink to="/app/offers/new" className="allUpsellsNewButton" style={{ textDecoration: "none" }}>
            <span aria-hidden="true">⊕</span> New Upsell
          </AdminAppLink>
        </header>

        <label className="allUpsellsSearch">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search upsells or main products..."
            aria-label="Search upsells or main products"
          />
        </label>

        <section className="allUpsellsTable" aria-label="All upsells">
          <div className="allUpsellsTableHeader">
            <span>Upsell Offer</span>
            <span>Status</span>
            <span>Purchases</span>
            <span>Conv. Rate</span>
            <span>Revenue</span>
            <span aria-hidden="true" />
          </div>
          {rows.length === 0 ? (
            <div className="allUpsellsEmpty">No upsells match your search.</div>
          ) : (
            rows.map(({ offer, productTitle, purchases: offerPurchases, conversionRate, revenue: offerRevenue }) => (
              <div key={offer.id} className="allUpsellsRow">
                <div className="allUpsellsOffer">
                  <strong>{offer.name}</strong>
                  <span>for {productTitle}</span>
                </div>
                <button
                  type="button"
                  className={offer.isActive ? "allUpsellsStatus active" : "allUpsellsStatus draft"}
                  onClick={() => toggleOfferStatus(offer.id)}
                  disabled={togglingId === offer.id}
                  aria-label={`Set ${offer.name} to ${offer.isActive ? "draft" : "active"}`}
                >
                  {offer.isActive ? "Active" : "Draft"}
                </button>
                <strong>{formatNumber(offerPurchases)}</strong>
                <strong className="allUpsellsPositive">
                  {conversionRate == null ? "—" : `${(conversionRate * 100).toFixed(1)}%`}
                </strong>
                <strong>{formatRevenue(offerRevenue)}</strong>
                <AdminAppLink to={`/app/analytics/${encodeURIComponent(offer.id)}`} className="allUpsellsDetails" style={{ textDecoration: "none" }}>
                  Details →
                </AdminAppLink>
              </div>
            ))
          )}
        </section>
      </main>
    </div>
  );
}
