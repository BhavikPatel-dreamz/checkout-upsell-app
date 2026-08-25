import type { LoaderFunctionArgs } from "react-router";
import db from "../db.server";
import { badRequest } from "../lib/http.server";
import { authenticate } from "../shopify.server";
import { getFilteredDashboardMetrics, getOfferTrendMetrics } from "../models/offerAnalytics.server";

function isValidShopDomain(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]+\.myshopify\.com$/.test(value);
}

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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const daysParam = url.searchParams.get("days") ?? "30";
  const statusParam = url.searchParams.get("status") ?? "all";
  const days = Math.max(1, Math.min(365, Number.parseInt(daysParam, 10) || 30));

  const validStatuses = ["all", "live", "draft"];
  const status = validStatuses.includes(statusParam) ? statusParam : "all";

  let shop: string;

  try {
    const { session } = await authenticate.admin(request);
    shop = session.shop;
  } catch {
    const shopCandidate =
      url.searchParams.get("shop") || request.headers.get("x-shopify-shop-domain") || null;
    if (shopCandidate && isValidShopDomain(shopCandidate)) {
      shop = shopCandidate;
    } else {
      return badRequest({ body: "Unable to load dashboard metrics" });
    }
  }

  const productParam = url.searchParams.get("product") ?? "all";

  const metrics = await getFilteredDashboardMetrics(shop, { days, status, product: productParam });

  // ensure trend metrics are explicitly fetched using the same days/status filter
  // (this guards against older callers that omitted trend calculations)
  const dateFrom = new Date();
  dateFrom.setHours(0, 0, 0, 0);
  dateFrom.setDate(dateFrom.getDate() - (days - 1));

  let offerIds: string[] | null = null;
  if (status && status !== "all") {
    const offerWhere: any = { shop };
    if (status === "live") offerWhere.isActive = true;
    else if (status === "draft") offerWhere.isActive = false;
    const matchingOffers = await db.offer.findMany({ where: offerWhere, select: { id: true } });
    offerIds = matchingOffers.map((o) => o.id);
  }

  const trendMetrics = await getOfferTrendMetrics(shop, days, { dateFrom, offerIds });

  const allProductIds = [
    ...metrics.viewMetrics.productBreakdown.map((r) => r.productId),
    ...metrics.clickMetrics.productBreakdown.map((r) => r.productId),
    ...metrics.addedToCartMetrics.productBreakdown.map((r) => r.productId),
    ...metrics.purchaseMetrics.productBreakdown.map((r) => r.productId),
  ];
  const productMetaMap = await getProductMetaMap(shop, allProductIds);

  return Response.json({ ...metrics, trendMetrics, productMetaMap });
};

export default function Route() {
  return null;
}
