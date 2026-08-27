import { useLoaderData, useRevalidator, type LoaderFunctionArgs } from "react-router";
import db from "../db.server";
import { authenticate } from "../shopify.server";
import {
  getOfferAddedToCartMetrics,
  getOfferClickMetrics,
  getOfferPurchaseMetrics,
  getOfferTrendMetrics,
  getOfferViewMetrics,
} from "../models/offerAnalytics.server";
import AnalyticsDashboard from "../components/analytics/AnalyticsDashboard";
import "../styles/analytics.css";

async function getProductMetaMap(shop: string, productIds: string[]) {
  const uniqueProductIds = Array.from(new Set(productIds.filter(Boolean)));
  if (uniqueProductIds.length === 0) {
    return { titles: {} as Record<string, string>, images: {} as Record<string, string> };
  }

  const rows = await db.productVariant.findMany({
    where: { shop, productId: { in: uniqueProductIds } },
    select: { productId: true, productTitle: true, imageUrl: true },
  });

  return rows.reduce<{ titles: Record<string, string>; images: Record<string, string> }>(
    (acc, row) => {
      acc.titles[row.productId] = row.productTitle || row.productId;
      if (row.imageUrl) acc.images[row.productId] = row.imageUrl;
      return acc;
    },
    { titles: {}, images: {} },
  );
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const viewMetrics = await getOfferViewMetrics(session.shop);
  const clickMetrics = await getOfferClickMetrics(session.shop);
  const addedToCartMetrics = await getOfferAddedToCartMetrics(session.shop);
  const purchaseMetrics = await getOfferPurchaseMetrics(session.shop);
  const trendMetrics = await getOfferTrendMetrics(session.shop, 12);

  const productIds = Array.from(
    new Set([
      ...viewMetrics.productBreakdown.map((row) => row.productId),
      ...clickMetrics.productBreakdown.map((row) => row.productId),
      ...addedToCartMetrics.productBreakdown.map((row) => row.productId),
      ...purchaseMetrics.productBreakdown.map((row) => row.productId),
    ]),
  );

  const productMetaMap = await getProductMetaMap(session.shop, productIds);

  return { viewMetrics, clickMetrics, addedToCartMetrics, purchaseMetrics, trendMetrics, productMetaMap };
}

export default function AnalyticsPage() {
  const revalidator = useRevalidator();
  const { viewMetrics, clickMetrics, addedToCartMetrics, purchaseMetrics, trendMetrics, productMetaMap } =
    useLoaderData<typeof loader>();

  const offerDetailUrl = (offerId: string) =>
    `/app/analytics/${encodeURIComponent(offerId)}`;

  return (
    <AnalyticsDashboard
      viewMetrics={viewMetrics}
      clickMetrics={clickMetrics}
      addedToCartMetrics={addedToCartMetrics}
      purchaseMetrics={purchaseMetrics}
      trendMetrics={trendMetrics}
      productMetaMap={productMetaMap}
      offerDetailUrl={offerDetailUrl}
      onRefresh={() => void revalidator.revalidate()}
      isRefreshing={revalidator.state === "loading"}
    />
  );
}
