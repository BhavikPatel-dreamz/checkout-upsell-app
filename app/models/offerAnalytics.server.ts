import { OfferEventType, OfferPlacement } from "@prisma/client";
import db from "../db.server";

const VIEW_DEDUPE_WINDOW_MS = 1000 * 60 * 60 * 24;

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
}

export interface OfferPurchaseMetrics {
  totalPurchases: number;
  offerBreakdown: Array<{ offerId: string; offerName: string; purchases: number }>;
  productBreakdown: Array<{ productId: string; purchases: number }>;
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

export async function getOfferViewMetrics(shop: string): Promise<OfferViewMetrics> {
  const [totalViews, uniqueLoggedInUsers, uniqueGuestUsers, offerSummary, productSummary] = await Promise.all([
    db.offerEvent.count({
      where: { shop, eventType: OfferEventType.viewed },
    }),
    db.offerEvent.groupBy({
      by: ["customerId"],
      where: {
        shop,
        eventType: OfferEventType.viewed,
        customerId: { not: null },
      },
      _count: { customerId: true },
    }),
    db.offerEvent.groupBy({
      by: ["guestKey"],
      where: {
        shop,
        eventType: OfferEventType.viewed,
        guestKey: { not: null },
      },
      _count: { guestKey: true },
    }),
    db.offerEvent.groupBy({
      by: ["offerId"],
      where: { shop, eventType: OfferEventType.viewed },
      _count: { _all: true },
    }),
    db.offerEvent.groupBy({
      by: ["productId"],
      where: { shop, eventType: OfferEventType.viewed },
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

export async function getOfferClickMetrics(shop: string): Promise<OfferClickMetrics> {
  const [totalClicks, offerSummary, productSummary] = await Promise.all([
    db.offerEvent.count({
      where: { shop, eventType: OfferEventType.clicked },
    }),
    db.offerEvent.groupBy({
      by: ["offerId"],
      where: { shop, eventType: OfferEventType.clicked },
      _count: { _all: true },
    }),
    db.offerEvent.groupBy({
      by: ["productId"],
      where: { shop, eventType: OfferEventType.clicked },
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

export async function getOfferAddedToCartMetrics(shop: string): Promise<OfferAddedToCartMetrics> {
  const [totalAddedToCart, offerSummary, productSummary] = await Promise.all([
    db.offerEvent.count({
      where: { shop, eventType: OfferEventType.added_to_cart },
    }),
    db.offerEvent.groupBy({
      by: ["offerId"],
      where: { shop, eventType: OfferEventType.added_to_cart },
      _count: { _all: true },
    }),
    db.offerEvent.groupBy({
      by: ["productId"],
      where: { shop, eventType: OfferEventType.added_to_cart },
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
    },
  });

  return { counted: true, duplicate: false, eventId: created.id };
}

export async function getOfferPurchaseMetrics(shop: string): Promise<OfferPurchaseMetrics> {
  // Guard against a stale Prisma client: if OfferEventType.purchased is
  // missing, the filter would silently drop and count ALL events as purchases.
  const purchasedType = OfferEventType.purchased;
  if (purchasedType !== "purchased") {
    throw new Error(
      "Purchase metrics unavailable: OfferEventType.purchased is missing from the generated Prisma client. Run `prisma generate`.",
    );
  }

  const [totalPurchases, offerSummary, productSummary] = await Promise.all([
    db.offerEvent.count({
      where: { shop, eventType: purchasedType },
    }),
    db.offerEvent.groupBy({
      by: ["offerId"],
      where: { shop, eventType: purchasedType },
      _count: { _all: true },
    }),
    db.offerEvent.groupBy({
      by: ["productId"],
      where: { shop, eventType: purchasedType },
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
    offerBreakdown,
    productBreakdown,
  };
}
