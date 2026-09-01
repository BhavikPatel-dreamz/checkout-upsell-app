import { OfferEventType, OfferPlacement, Prisma } from "@prisma/client";
import db from "../db.server";
import { getBrowseToOfferMetrics } from "./browseActivity.server";

const VIEW_DEDUPE_WINDOW_MS = 1000 * 60 * 60 * 24;

export interface AnalyticsDashboardFilters {
  dateFrom?: Date | null;
  dateTo?: Date | null;
  offerIds?: string[] | null;
}

export interface OfferViewTrackingInput {
  shop: string;
  offerId: string;
  offerName?: string | null;
  productId: string;
  variantId: string;
  placement: OfferPlacement;
  customerId?: string | null;
  guestKey?: string | null;
  isGuest?: boolean;
}

export interface OfferViewMetrics {
  totalViews: number;
  uniqueLoggedInUsers: number;
  uniqueGuestUsers: number;
  offerBreakdown: Array<{ offerId: string; offerName: string; views: number }>;
  productBreakdown: Array<{ productId: string; views: number }>;
}

export interface OfferClickTrackingInput {
  shop: string;
  offerId: string;
  offerName?: string | null;
  productId: string;
  variantId: string;
  placement: OfferPlacement;
  customerId?: string | null;
  guestKey?: string | null;
  isGuest?: boolean;
}

export interface OfferClickMetrics {
  totalClicks: number;
  offerBreakdown: Array<{ offerId: string; offerName: string; clicks: number }>;
  productBreakdown: Array<{ productId: string; clicks: number }>;
}

export interface OfferAddedToCartTrackingInput {
  shop: string;
  offerId: string;
  offerName?: string | null;
  productId: string;
  variantId: string;
  placement: OfferPlacement;
  customerId?: string | null;
  guestKey?: string | null;
  isGuest?: boolean;
}

export interface OfferAddedToCartMetrics {
  totalAddedToCart: number;
  offerBreakdown: Array<{ offerId: string; offerName: string; addedToCart: number }>;
  productBreakdown: Array<{ productId: string; addedToCart: number }>;
}

export interface OfferPurchaseTrackingInput {
  shop: string;
  offerId: string;
  offerName?: string | null;
  productId: string;
  variantId: string;
  placement: OfferPlacement;
  orderId: string;
  customerId?: string | null;
  guestKey?: string | null;
  isGuest?: boolean;
  revenue?: number | string | Prisma.Decimal | null;
}

export interface OfferPurchaseMetrics {
  totalPurchases: number;
  totalRevenue: number;
  offerBreakdown: Array<{ offerId: string; offerName: string; purchases: number }>;
  productBreakdown: Array<{ productId: string; purchases: number }>;
}

export interface OfferAnalyticsDetailProduct {
  offerId: string;
  productId: string;
  productName: string;
  imageUrl: string | null;
  views: number;
  clicks: number;
  addedToCart: number;
  purchases: number;
}

export interface OfferAnalyticsDetail {
  offer: {
    id: string;
    name: string;
    isActive: boolean;
    configuredProductCount: number;
  };
  summary: {
    totalViews: number;
    totalClicks: number;
    totalAddedToCart: number;
    totalPurchases: number;
    uniqueLoggedInUsers: number;
    uniqueGuestUsers: number;
  };
  funnel: {
    views: number;
    clicks: number;
    addedToCart: number;
    purchases: number;
    clickThroughRate: number | null;
    addToCartRate: number | null;
    purchaseRate: number | null;
    viewToPurchaseRate: number | null;
  };
  browseToOffer: {
    browseIdentities: number;
    offerViewIdentities: number;
    overlap: number;
    browseToOfferRate: number | null;
  };
  totalRevenue: number;
  products: OfferAnalyticsDetailProduct[];
}

export async function getOfferAnalyticsForOffer(shop: string, offerId: string): Promise<OfferAnalyticsDetail | null> {
  const offer = await db.offer.findUnique({
    where: { shop, id: offerId },
    select: {
      id: true,
      name: true,
      isActive: true,
      targetProductIds: true,
      triggerRules: true,
    },
  });

  if (!offer) return null;

  const rows = await db.offerEvent.findMany({
    where: { shop, offerId },
    select: {
      eventType: true,
      customerId: true,
      guestKey: true,
      productId: true,
    },
  });

  const uniqueLoggedInUsers = new Set<string>();
  const uniqueGuestUsers = new Set<string>();

  const totals = {
    totalViews: 0,
    totalClicks: 0,
    totalAddedToCart: 0,
    totalPurchases: 0,
  };

  const productMap = new Map<
    string,
    {
      offerId: string;
      productId: string;
      productName: string;
      imageUrl: string | null;
      views: number;
      clicks: number;
      addedToCart: number;
      purchases: number;
    }
  >();

  for (const row of rows) {
    if (row.eventType === OfferEventType.viewed) {
      totals.totalViews += 1;
      if (row.customerId) uniqueLoggedInUsers.add(row.customerId);
      if (row.guestKey) uniqueGuestUsers.add(row.guestKey);
    }
    if (row.eventType === OfferEventType.clicked) totals.totalClicks += 1;
    if (row.eventType === OfferEventType.added_to_cart) totals.totalAddedToCart += 1;
    if (row.eventType === OfferEventType.purchased) totals.totalPurchases += 1;

    if (!row.productId) continue;

    const productEntry =
      productMap.get(row.productId) ?? {
        offerId,
        productId: row.productId,
        productName: row.productId,
        imageUrl: null,
        views: 0,
        clicks: 0,
        addedToCart: 0,
        purchases: 0,
      };

    if (row.eventType === OfferEventType.viewed) productEntry.views += 1;
    if (row.eventType === OfferEventType.clicked) productEntry.clicks += 1;
    if (row.eventType === OfferEventType.added_to_cart) productEntry.addedToCart += 1;
    if (row.eventType === OfferEventType.purchased) productEntry.purchases += 1;

    productMap.set(row.productId, productEntry);
  }

  const revenueResult = await db.offerEvent.aggregate({
    where: { shop, offerId, eventType: OfferEventType.purchased },
    _sum: { revenue: true },
  });
  const totalRevenue = revenueResult._sum.revenue == null ? 0 : Number(revenueResult._sum.revenue.toString());

  const productIds = Array.from(productMap.keys());
  const productMetaRows = productIds.length
    ? await db.productVariant.findMany({
        where: { shop, productId: { in: productIds } },
        select: { productId: true, productTitle: true, imageUrl: true },
      })
    : [];

  const productMetaMap = new Map(
    productMetaRows.map((row) => [row.productId, { productName: row.productTitle || row.productId, imageUrl: row.imageUrl ?? null }]),
  );

  const products = Array.from(productMap.values())
    .map((product) => {
      const meta = productMetaMap.get(product.productId);
      return {
        ...product,
        productName: meta?.productName ?? product.productId,
        imageUrl: meta?.imageUrl ?? null,
      };
    })
    .sort((a, b) => {
      const scoreA = a.views + a.clicks + a.addedToCart + a.purchases;
      const scoreB = b.views + b.clicks + b.addedToCart + b.purchases;
      return scoreB - scoreA || b.views - a.views || a.productId.localeCompare(b.productId);
    });

  const triggerRules = (offer.triggerRules ?? {}) as Record<string, unknown>;
  const manualSelections = Array.isArray(triggerRules.manualSelections)
    ? triggerRules.manualSelections
    : Array.isArray((triggerRules.productSelection as { items?: unknown[] } | undefined)?.items)
      ? ((triggerRules.productSelection as { items?: unknown[] }).items as unknown[])
      : [];
  const configuredProductCount =
    manualSelections.length > 0
      ? manualSelections.filter((item) => item && typeof (item as { productId?: unknown }).productId === "string").length
      : Array.isArray(offer.targetProductIds)
        ? offer.targetProductIds.filter(Boolean).length
        : 0;

  const clickThroughRate = totals.totalViews > 0 ? totals.totalClicks / totals.totalViews : null;
  const addToCartRate = totals.totalClicks > 0 ? totals.totalAddedToCart / totals.totalClicks : null;
  const purchaseRate = totals.totalAddedToCart > 0 ? totals.totalPurchases / totals.totalAddedToCart : null;
  const viewToPurchaseRate = totals.totalViews > 0 ? totals.totalPurchases / totals.totalViews : null;
  const browseToOffer = await getBrowseToOfferMetrics(shop, { offerId });

  return {
    offer: {
      id: offer.id,
      name: offer.name,
      isActive: offer.isActive,
      configuredProductCount,
    },
    summary: {
      totalViews: totals.totalViews,
      totalClicks: totals.totalClicks,
      totalAddedToCart: totals.totalAddedToCart,
      totalPurchases: totals.totalPurchases,
      uniqueLoggedInUsers: uniqueLoggedInUsers.size,
      uniqueGuestUsers: uniqueGuestUsers.size,
    },
    funnel: {
      views: totals.totalViews,
      clicks: totals.totalClicks,
      addedToCart: totals.totalAddedToCart,
      purchases: totals.totalPurchases,
      clickThroughRate,
      addToCartRate,
      purchaseRate,
      viewToPurchaseRate,
    },
    browseToOffer,
    totalRevenue,
    products,
  };
}

export async function trackOfferImpression(
  input: OfferViewTrackingInput,
): Promise<{ counted: boolean; duplicate: boolean; eventId?: string | null }> {
  const shop = input.shop?.trim();
  const offerId = input.offerId?.trim();
  const productId = input.productId?.trim();
  const variantId = input.variantId?.trim();
  const customerId = input.customerId?.trim() || null;
  const guestKey = input.guestKey?.trim() || null;

  if (!shop || !offerId || !productId || !variantId || !input.placement) {
    return { counted: false, duplicate: false, eventId: null };
  }

  const isGuest = input.isGuest === true || (!customerId && !!guestKey);
  const identityCustomerId = isGuest ? null : customerId;
  const identityGuestKey = isGuest ? guestKey : null;

  if (!identityCustomerId && !identityGuestKey) {
    return { counted: false, duplicate: false, eventId: null };
  }

  const cutoff = new Date(Date.now() - VIEW_DEDUPE_WINDOW_MS);

  const duplicate = await db.offerEvent.findFirst({
    where: {
      shop,
      offerId,
      productId,
      variantId,
      eventType: OfferEventType.viewed,
      createdAt: { gte: cutoff },
      ...(identityCustomerId
        ? { customerId: identityCustomerId }
        : { guestKey: identityGuestKey }),
    },
    select: { id: true },
  });

  if (duplicate) {
    return { counted: false, duplicate: true, eventId: duplicate.id };
  }

  const created = await db.offerEvent.create({
    data: {
      shop,
      offerId,
      eventType: OfferEventType.viewed,
      customerId: identityCustomerId,
      guestKey: identityGuestKey,
      productId,
      variantId,
      placement: input.placement,
    },
  });

  return { counted: true, duplicate: false, eventId: created.id };
}

export async function getOfferViewMetrics(shop: string, filters?: AnalyticsDashboardFilters): Promise<OfferViewMetrics> {
  const eventWhere: Prisma.OfferEventWhereInput = { shop, eventType: OfferEventType.viewed };
  if (filters?.dateFrom || filters?.dateTo) {
    eventWhere.createdAt = {
      ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
      ...(filters.dateTo ? { lte: filters.dateTo } : {}),
    };
  }
  if (filters?.offerIds && filters.offerIds.length > 0) {
    eventWhere.offerId = { in: filters.offerIds };
  }

  const [totalViews, uniqueLoggedInUsers, uniqueGuestUsers, offerSummary, productSummary] = await Promise.all([
    db.offerEvent.count({ where: eventWhere }),
    db.offerEvent.groupBy({
      by: ["customerId"],
      where: { ...eventWhere, customerId: { not: null } },
      _count: { customerId: true },
    }),
    db.offerEvent.groupBy({
      by: ["guestKey"],
      where: { ...eventWhere, guestKey: { not: null } },
      _count: { guestKey: true },
    }),
    db.offerEvent.groupBy({
      by: ["offerId"],
      where: eventWhere,
      _count: { _all: true },
    }),
    db.offerEvent.groupBy({
      by: ["productId"],
      where: eventWhere,
      _count: { _all: true },
    }),
  ]);

  const offerIds = offerSummary.map((row) => row.offerId).filter(Boolean);
  const offerMap = new Map(
    (await db.offer.findMany({
      where: { shop, id: { in: offerIds } },
      select: { id: true, name: true },
    })).map((offer) => [offer.id, offer.name]),
  );

  const offerBreakdown = offerSummary
    .map((row) => ({
      offerId: row.offerId,
      offerName: offerMap.get(row.offerId) ?? "Unknown offer",
      views: row._count._all,
    }))
    .sort((a, b) => b.views - a.views || a.offerName.localeCompare(b.offerName));

  const productBreakdown = productSummary
    .filter((row) => Boolean(row.productId))
    .map((row) => ({
      productId: row.productId as string,
      views: row._count._all,
    }))
    .sort((a, b) => b.views - a.views || a.productId.localeCompare(b.productId));

  return {
    totalViews,
    uniqueLoggedInUsers: uniqueLoggedInUsers.length,
    uniqueGuestUsers: uniqueGuestUsers.length,
    offerBreakdown,
    productBreakdown,
  };
}

export async function trackOfferClick(
  input: OfferClickTrackingInput,
): Promise<{ counted: boolean; duplicate: boolean; eventId?: string | null }> {
  const shop = input.shop?.trim();
  const offerId = input.offerId?.trim();
  const productId = input.productId?.trim();
  const variantId = input.variantId?.trim();
  const customerId = input.customerId?.trim() || null;
  const guestKey = input.guestKey?.trim() || null;

  if (!shop || !offerId || !productId || !variantId || !input.placement) {
    return { counted: false, duplicate: false, eventId: null };
  }

  const isGuest = input.isGuest === true || (!customerId && !!guestKey);
  const identityCustomerId = isGuest ? null : customerId;
  const identityGuestKey = isGuest ? guestKey : null;

  if (!identityCustomerId && !identityGuestKey) {
    return { counted: false, duplicate: false, eventId: null };
  }

  const cutoff = new Date(Date.now() - 1000 * 60 * 60 * 24);

  const duplicate = await db.offerEvent.findFirst({
    where: {
      shop,
      offerId,
      productId,
      variantId,
      eventType: OfferEventType.clicked,
      createdAt: { gte: cutoff },
      ...(identityCustomerId
        ? { customerId: identityCustomerId }
        : { guestKey: identityGuestKey }),
    },
    select: { id: true },
  });

  if (duplicate) {
    return { counted: false, duplicate: true, eventId: duplicate.id };
  }

  const created = await db.offerEvent.create({
    data: {
      shop,
      offerId,
      eventType: OfferEventType.clicked,
      customerId: identityCustomerId,
      guestKey: identityGuestKey,
      productId,
      variantId,
      placement: input.placement,
    },
  });

  return { counted: true, duplicate: false, eventId: created.id };
}

export async function getOfferClickMetrics(shop: string, filters?: AnalyticsDashboardFilters): Promise<OfferClickMetrics> {
  const eventWhere: Prisma.OfferEventWhereInput = { shop, eventType: OfferEventType.clicked };
  if (filters?.dateFrom || filters?.dateTo) {
    eventWhere.createdAt = {
      ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
      ...(filters.dateTo ? { lte: filters.dateTo } : {}),
    };
  }
  if (filters?.offerIds && filters.offerIds.length > 0) {
    eventWhere.offerId = { in: filters.offerIds };
  }

  const [totalClicks, offerSummary, productSummary] = await Promise.all([
    db.offerEvent.count({ where: eventWhere }),
    db.offerEvent.groupBy({
      by: ["offerId"],
      where: eventWhere,
      _count: { _all: true },
    }),
    db.offerEvent.groupBy({
      by: ["productId"],
      where: eventWhere,
      _count: { _all: true },
    }),
  ]);

  const offerIds = offerSummary.map((row) => row.offerId).filter(Boolean);
  const offerMap = new Map(
    (await db.offer.findMany({
      where: { shop, id: { in: offerIds } },
      select: { id: true, name: true },
    })).map((offer) => [offer.id, offer.name]),
  );

  const offerBreakdown = offerSummary
    .map((row) => ({
      offerId: row.offerId,
      offerName: offerMap.get(row.offerId) ?? "Unknown offer",
      clicks: row._count._all,
    }))
    .sort((a, b) => b.clicks - a.clicks || a.offerName.localeCompare(b.offerName));

  const productBreakdown = productSummary
    .filter((row) => Boolean(row.productId))
    .map((row) => ({
      productId: row.productId as string,
      clicks: row._count._all,
    }))
    .sort((a, b) => b.clicks - a.clicks || a.productId.localeCompare(b.productId));

  return {
    totalClicks,
    offerBreakdown,
    productBreakdown,
  };
}

export async function trackOfferAddedToCart(
  input: OfferAddedToCartTrackingInput,
): Promise<{ counted: boolean; duplicate: boolean; eventId?: string | null }> {
  const shop = input.shop?.trim();
  const offerId = input.offerId?.trim();
  const productId = input.productId?.trim();
  const variantId = input.variantId?.trim();
  const customerId = input.customerId?.trim() || null;
  const guestKey = input.guestKey?.trim() || null;

  if (!shop || !offerId || !productId || !variantId || !input.placement) {
    return { counted: false, duplicate: false, eventId: null };
  }

  const isGuest = input.isGuest === true || (!customerId && !!guestKey);
  const identityCustomerId = isGuest ? null : customerId;
  const identityGuestKey = isGuest ? guestKey : null;

  if (!identityCustomerId && !identityGuestKey) {
    return { counted: false, duplicate: false, eventId: null };
  }

  const cutoff = new Date(Date.now() - 1000 * 60 * 60 * 24);

  const duplicate = await db.offerEvent.findFirst({
    where: {
      shop,
      offerId,
      productId,
      variantId,
      eventType: OfferEventType.added_to_cart,
      createdAt: { gte: cutoff },
      ...(identityCustomerId
        ? { customerId: identityCustomerId }
        : { guestKey: identityGuestKey }),
    },
    select: { id: true },
  });

  if (duplicate) {
    return { counted: false, duplicate: true, eventId: duplicate.id };
  }

  const created = await db.offerEvent.create({
    data: {
      shop,
      offerId,
      eventType: OfferEventType.added_to_cart,
      customerId: identityCustomerId,
      guestKey: identityGuestKey,
      productId,
      variantId,
      placement: input.placement,
    },
  });

  return { counted: true, duplicate: false, eventId: created.id };
}

export async function getOfferAddedToCartMetrics(shop: string, filters?: AnalyticsDashboardFilters): Promise<OfferAddedToCartMetrics> {
  const eventWhere: Prisma.OfferEventWhereInput = { shop, eventType: OfferEventType.added_to_cart };
  if (filters?.dateFrom || filters?.dateTo) {
    eventWhere.createdAt = {
      ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
      ...(filters.dateTo ? { lte: filters.dateTo } : {}),
    };
  }
  if (filters?.offerIds && filters.offerIds.length > 0) {
    eventWhere.offerId = { in: filters.offerIds };
  }

  const [totalAddedToCart, offerSummary, productSummary] = await Promise.all([
    db.offerEvent.count({ where: eventWhere }),
    db.offerEvent.groupBy({
      by: ["offerId"],
      where: eventWhere,
      _count: { _all: true },
    }),
    db.offerEvent.groupBy({
      by: ["productId"],
      where: eventWhere,
      _count: { _all: true },
    }),
  ]);

  const offerIds = offerSummary.map((row) => row.offerId).filter(Boolean);
  const offerMap = new Map(
    (await db.offer.findMany({
      where: { shop, id: { in: offerIds } },
      select: { id: true, name: true },
    })).map((offer) => [offer.id, offer.name]),
  );

  const offerBreakdown = offerSummary
    .map((row) => ({
      offerId: row.offerId,
      offerName: offerMap.get(row.offerId) ?? "Unknown offer",
      addedToCart: row._count._all,
    }))
    .sort((a, b) => b.addedToCart - a.addedToCart || a.offerName.localeCompare(b.offerName));

  const productBreakdown = productSummary
    .filter((row) => Boolean(row.productId))
    .map((row) => ({
      productId: row.productId as string,
      addedToCart: row._count._all,
    }))
    .sort((a, b) => b.addedToCart - a.addedToCart || a.productId.localeCompare(b.productId));

  return {
    totalAddedToCart,
    offerBreakdown,
    productBreakdown,
  };
}

export async function trackOfferPurchase(
  input: OfferPurchaseTrackingInput,
): Promise<{ counted: boolean; duplicate: boolean; eventId?: string | null }> {
  const shop = input.shop?.trim();
  const offerId = input.offerId?.trim();
  const productId = input.productId?.trim();
  const variantId = input.variantId?.trim();
  const orderId = input.orderId?.trim();
  const customerId = input.customerId?.trim() || null;
  const guestKey = input.guestKey?.trim() || null;

  if (!shop || !offerId || !productId || !variantId || !orderId || !input.placement) {
    return { counted: false, duplicate: false, eventId: null };
  }

  const isGuest = input.isGuest === true || (!customerId && !!guestKey);
  const identityCustomerId = isGuest ? null : customerId;
  const identityGuestKey = isGuest ? guestKey : null;

  if (!identityCustomerId && !identityGuestKey) {
    return { counted: false, duplicate: false, eventId: null };
  }

  const rawRevenue = input.revenue == null ? null : Number(input.revenue);
  const normalizedRevenue = Number.isFinite(rawRevenue) ? Math.max(0, rawRevenue as number) : null;

  const duplicate = await db.offerEvent.findFirst({
    where: {
      shop,
      offerId,
      productId,
      variantId,
      eventType: OfferEventType.purchased,
      orderId,
      ...(identityCustomerId ? { customerId: identityCustomerId } : { guestKey: identityGuestKey }),
    },
    select: { id: true },
  });

  if (duplicate) {
    return { counted: false, duplicate: true, eventId: duplicate.id };
  }

  const created = await db.offerEvent.create({
    data: {
      shop,
      offerId,
      orderId,
      eventType: OfferEventType.purchased,
      customerId: identityCustomerId,
      guestKey: identityGuestKey,
      productId,
      variantId,
      placement: input.placement,
      ...(normalizedRevenue != null ? { revenue: normalizedRevenue } : {}),
    },
  });

  return { counted: true, duplicate: false, eventId: created.id };
}

export async function getOfferPurchaseMetrics(shop: string, filters?: AnalyticsDashboardFilters): Promise<OfferPurchaseMetrics> {
  const purchasedType = OfferEventType.purchased;
  if (purchasedType !== "purchased") {
    throw new Error(
      "Purchase metrics unavailable: OfferEventType.purchased is missing from the generated Prisma client. Run `prisma generate`.",
    );
  }

  const eventWhere: Prisma.OfferEventWhereInput = { shop, eventType: purchasedType };
  if (filters?.dateFrom || filters?.dateTo) {
    eventWhere.createdAt = {
      ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
      ...(filters.dateTo ? { lte: filters.dateTo } : {}),
    };
  }
  if (filters?.offerIds && filters.offerIds.length > 0) {
    eventWhere.offerId = { in: filters.offerIds };
  }

  const [totalPurchases, revenueTotals, offerSummary, productSummary] = await Promise.all([
    db.offerEvent.count({ where: eventWhere }),
    db.offerEvent.aggregate({ where: eventWhere, _sum: { revenue: true } }),
    db.offerEvent.groupBy({
      by: ["offerId"],
      where: eventWhere,
      _count: { _all: true },
    }),
    db.offerEvent.groupBy({
      by: ["productId"],
      where: eventWhere,
      _count: { _all: true },
    }),
  ]);

  const totalRevenue = revenueTotals._sum.revenue == null ? 0 : Number(revenueTotals._sum.revenue.toString());

  const offerIds = offerSummary.map((row) => row.offerId).filter(Boolean);
  const offerMap = new Map(
    (await db.offer.findMany({
      where: { shop, id: { in: offerIds } },
      select: { id: true, name: true },
    })).map((offer) => [offer.id, offer.name]),
  );

  const offerBreakdown = offerSummary
    .map((row) => ({
      offerId: row.offerId,
      offerName: offerMap.get(row.offerId) ?? "Unknown offer",
      purchases: row._count._all,
    }))
    .sort((a, b) => b.purchases - a.purchases || a.offerName.localeCompare(b.offerName));

  const productBreakdown = productSummary
    .filter((row) => Boolean(row.productId))
    .map((row) => ({
      productId: row.productId as string,
      purchases: row._count._all,
    }))
    .sort((a, b) => b.purchases - a.purchases || a.productId.localeCompare(b.productId));

  return {
    totalPurchases,
    totalRevenue,
    offerBreakdown,
    productBreakdown,
  };
}

/** Purchase revenue grouped by offer for list views. Values are persisted event revenue, not estimates. */
export async function getOfferRevenueByOffer(shop: string): Promise<Array<{ offerId: string; revenue: number }>> {
  const rows = await db.offerEvent.groupBy({
    by: ["offerId"],
    where: { shop, eventType: OfferEventType.purchased },
    _sum: { revenue: true },
  });

  return rows.map((row) => ({
    offerId: row.offerId,
    revenue: row._sum.revenue == null ? 0 : Number(row._sum.revenue.toString()),
  }));
}

export async function getOfferTrendMetrics(shop: string, days = 12, filters?: AnalyticsDashboardFilters): Promise<{
  labels: string[];
  views: number[];
  clicks: number[];
  addedToCart: number[];
  purchases: number[];
}> {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));

  const eventWhere: Prisma.OfferEventWhereInput = { shop, createdAt: { gte: since } };
  if (filters?.dateFrom || filters?.dateTo) {
    eventWhere.createdAt = {
      gte: filters.dateFrom && filters.dateFrom > since ? filters.dateFrom : since,
      ...(filters.dateTo ? { lte: filters.dateTo } : {}),
    };
  }
  if (filters?.offerIds && filters.offerIds.length > 0) {
    eventWhere.offerId = { in: filters.offerIds };
  }

  const rows = await db.offerEvent.findMany({
    where: eventWhere,
    select: {
      createdAt: true,
      eventType: true,
    },
  });

  const bucketMap = new Map<string, { views: number; clicks: number; addedToCart: number; purchases: number }>();

  for (let i = 0; i < days; i += 1) {
    const date = new Date(since);
    date.setDate(since.getDate() + i);
    const key = date.toISOString().slice(0, 10);
    bucketMap.set(key, { views: 0, clicks: 0, addedToCart: 0, purchases: 0 });
  }

  for (const row of rows) {
    const key = row.createdAt.toISOString().slice(0, 10);
    if (!bucketMap.has(key)) continue;
    const bucket = bucketMap.get(key)!;

    if (row.eventType === OfferEventType.viewed) bucket.views += 1;
    if (row.eventType === OfferEventType.clicked) bucket.clicks += 1;
    if (row.eventType === OfferEventType.added_to_cart) bucket.addedToCart += 1;
    if (row.eventType === OfferEventType.purchased) bucket.purchases += 1;
  }

  const labels: string[] = [];
  const views: number[] = [];
  const clicks: number[] = [];
  const addedToCart: number[] = [];
  const purchases: number[] = [];

  for (let i = 0; i < days; i += 1) {
    const date = new Date(since);
    date.setDate(since.getDate() + i);
    const key = date.toISOString().slice(0, 10);
    const bucket = bucketMap.get(key) ?? { views: 0, clicks: 0, addedToCart: 0, purchases: 0 };
    labels.push(date.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
    views.push(bucket.views);
    clicks.push(bucket.clicks);
    addedToCart.push(bucket.addedToCart);
    purchases.push(bucket.purchases);
  }

  return { labels, views, clicks, addedToCart, purchases };
}

export interface DashboardFilterParams {
  days?: number;
  status?: string;
  product?: string;
}

export interface DashboardMetricsResult {
  viewMetrics: OfferViewMetrics;
  clickMetrics: OfferClickMetrics;
  addedToCartMetrics: OfferAddedToCartMetrics;
  purchaseMetrics: OfferPurchaseMetrics;
  trendMetrics: {
    labels: string[];
    views: number[];
    clicks: number[];
    addedToCart: number[];
    purchases: number[];
  };
  funnelRates: {
    viewToClick: number | null;
    clickToAddedToCart: number | null;
    addedToCartToPurchase: number | null;
    viewToPurchase: number | null;
  };
  browseToOffer: {
    browseIdentities: number;
    offerViewIdentities: number;
    overlap: number;
    browseToOfferRate: number | null;
  };
}

export async function getFilteredDashboardMetrics(
  shop: string,
  params: DashboardFilterParams,
): Promise<DashboardMetricsResult> {
  const days = Math.max(1, Math.min(365, params.days ?? 30));

  const dateFrom = new Date();
  dateFrom.setHours(0, 0, 0, 0);
  dateFrom.setDate(dateFrom.getDate() - (days - 1));

  let offerIds: string[] | null = null;
  if (params.status && params.status !== "all") {
    const offerWhere: Prisma.OfferWhereInput = { shop };
    if (params.status === "live") offerWhere.isActive = true;
    else if (params.status === "draft") offerWhere.isActive = false;
    const matchingOffers = await db.offer.findMany({ where: offerWhere, select: { id: true } });
    offerIds = matchingOffers.map((o) => o.id);
  }

  const filters: AnalyticsDashboardFilters = {
    dateFrom,
    offerIds,
  };

  const [viewMetrics, clickMetrics, addedToCartMetrics, purchaseMetrics, trendMetrics, browseToOffer] = await Promise.all([
    getOfferViewMetrics(shop, filters),
    getOfferClickMetrics(shop, filters),
    getOfferAddedToCartMetrics(shop, filters),
    getOfferPurchaseMetrics(shop, filters),
    getOfferTrendMetrics(shop, days, filters),
    getBrowseToOfferMetrics(shop, { dateFrom }),
  ]);

  const funnelRates = {
    viewToClick: viewMetrics.totalViews > 0 ? clickMetrics.totalClicks / viewMetrics.totalViews : null,
    clickToAddedToCart: clickMetrics.totalClicks > 0 ? addedToCartMetrics.totalAddedToCart / clickMetrics.totalClicks : null,
    addedToCartToPurchase:
      addedToCartMetrics.totalAddedToCart > 0
        ? purchaseMetrics.totalPurchases / addedToCartMetrics.totalAddedToCart
        : null,
    viewToPurchase: viewMetrics.totalViews > 0 ? purchaseMetrics.totalPurchases / viewMetrics.totalViews : null,
  };

  return { viewMetrics, clickMetrics, addedToCartMetrics, purchaseMetrics, trendMetrics, funnelRates, browseToOffer };
}
