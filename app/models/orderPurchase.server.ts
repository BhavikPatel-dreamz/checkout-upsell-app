import { OfferEventType, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import db from "../db.server";
import {
  allowsAnalyticsPersistence,
  parseShopperEventEnvelope,
  toShopperEventCreateData,
} from "../ai/events/envelope";
import { recordIdentitySighting, resolveCustomerId } from "../ai/events/identity.server";

export const PURCHASE_ATTRIBUTION_WINDOW_MS = 1000 * 60 * 60 * 24 * 7;

const ATTRIBUTION_EVENT_NAMES = [
  "recommendation_add",
  "recommendation_click",
  "recommendation_view",
  "recommendation_purchase",
];

function getString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function toGid(type: "Product" | "ProductVariant" | "Customer", value: string | null): string | null {
  if (!value) return null;
  if (value.startsWith("gid://")) return value;
  return `gid://shopify/${type}/${value}`;
}

function lineProperties(lineItem: Record<string, unknown>): Record<string, string> {
  const props: Record<string, string> = {};
  const sources = [
    lineItem.properties,
    lineItem.customAttributes,
    lineItem.custom_attributes,
    lineItem.attributes,
  ];
  for (const raw of sources) {
    if (Array.isArray(raw)) {
      for (const entry of raw) {
        if (!entry || typeof entry !== "object") continue;
        const row = entry as Record<string, unknown>;
        const key = getString(row.name ?? row.key);
        if (!key) continue;
        props[key.trim().toLowerCase()] = getString(row.value) ?? "";
      }
    } else if (raw && typeof raw === "object") {
      for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        props[key.trim().toLowerCase()] = getString(value) ?? "";
      }
    }
  }
  return props;
}

export function orderIdFromPayload(order: Record<string, unknown>): string {
  return (
    getString(order.admin_graphql_api_id ?? order.id ?? order.name) ??
    `order-${randomUUID()}`
  );
}

function idCandidates(type: "Product" | "ProductVariant", value: string | null): string[] {
  if (!value) return [];
  const gid = toGid(type, value);
  const numeric = value.match(/(\d+)\s*$/)?.[1] ?? null;
  return Array.from(new Set([value, gid, numeric].filter((item): item is string => Boolean(item))));
}

function moneyFromPriceSet(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const set = value as Record<string, unknown>;
  const shopMoney = set.shop_money ?? set.shopMoney ?? set.presentment_money ?? set.presentmentMoney;
  if (!shopMoney || typeof shopMoney !== "object") return null;
  return getString((shopMoney as Record<string, unknown>).amount);
}

export function orderTotalPrice(order: Record<string, unknown>): number | null {
  const raw =
    getString(order.total_price) ??
    getString(order.current_total_price) ??
    getString(order.total_price_usd) ??
    moneyFromPriceSet(order.total_price_set) ??
    moneyFromPriceSet(order.current_total_price_set) ??
    moneyFromPriceSet(order.currentTotalPriceSet) ??
    moneyFromPriceSet(order.totalPriceSet);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function lineRevenue(lineItem: Record<string, unknown>): Prisma.Decimal | null {
  const priceRaw =
    getString(lineItem.price ?? lineItem.total_price ?? lineItem.discounted_price) ??
    moneyFromPriceSet(lineItem.price_set) ??
    moneyFromPriceSet(lineItem.discounted_price_set);
  if (!priceRaw) return null;
  const price = Number.parseFloat(priceRaw);
  if (!Number.isFinite(price)) return null;
  const quantity = Number.parseInt(getString(lineItem.quantity) ?? "1", 10);
  const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
  const amount = price * safeQuantity;
  if (amount < 0) return null;
  return new Prisma.Decimal(amount.toFixed(2));
}

async function lastRecommendation(input: {
  shop: string;
  at: Date;
  customerId: string | null;
  sessionId: string | null;
  anonId: string | null;
  productId: string | null;
  variantId: string | null;
}): Promise<{ offerId: string; productId: string | null; variantId: string | null } | null> {
  const since = new Date(input.at.getTime() - PURCHASE_ATTRIBUTION_WINDOW_MS);
  const identityOr = [
    ...(input.customerId ? [{ customerId: input.customerId }] : []),
    ...(input.sessionId ? [{ sessionId: input.sessionId }, { anonId: input.sessionId }] : []),
    ...(input.anonId ? [{ anonId: input.anonId }, { sessionId: input.anonId }] : []),
  ];
  if (identityOr.length === 0) return null;

  const productIds = idCandidates("Product", input.productId);
  const variantIds = idCandidates("ProductVariant", input.variantId);
  const productOr = [
    ...(productIds.length ? [{ productId: { in: productIds } }] : []),
    ...(variantIds.length ? [{ variantId: { in: variantIds } }] : []),
  ];
  if (productOr.length === 0) return null;

  const rec = await db.shopperEvent.findFirst({
    where: {
      shop: input.shop,
      name: { in: ATTRIBUTION_EVENT_NAMES },
      recommendationId: { not: null },
      occurredAt: { gte: since, lte: input.at },
      AND: [{ OR: identityOr }, { OR: productOr }],
    },
    orderBy: { occurredAt: "desc" },
    select: { recommendationId: true, productId: true, variantId: true },
  });
  if (rec?.recommendationId) {
    return {
      offerId: rec.recommendationId,
      productId: rec.productId,
      variantId: rec.variantId,
    };
  }

  const add = await db.offerEvent.findFirst({
    where: {
      shop: input.shop,
      eventType: OfferEventType.added_to_cart,
      createdAt: { gte: since, lte: input.at },
      AND: [
        {
          OR: [
            ...(input.customerId ? [{ customerId: input.customerId }] : []),
            ...(input.sessionId ? [{ guestKey: input.sessionId }] : []),
            ...(input.anonId ? [{ guestKey: input.anonId }] : []),
          ],
        },
        {
          OR: [
            ...(productIds.length ? [{ productId: { in: productIds } }] : []),
            ...(variantIds.length ? [{ variantId: { in: variantIds } }] : []),
          ],
        },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { offerId: true, productId: true, variantId: true },
  });
  if (!add) return null;
  return { offerId: add.offerId, productId: add.productId, variantId: add.variantId };
}

async function dualWriteOfferPurchased(input: {
  shop: string;
  offerId: string;
  orderId: string;
  lineItemId: string | null;
  productId: string;
  variantId: string;
  customerId: string | null;
  guestKey: string | null;
  revenue: Prisma.Decimal | null;
}): Promise<void> {
  const offer = await db.offer.findFirst({
    where: { shop: input.shop, id: input.offerId },
    select: { id: true, placement: true },
  });
  if (!offer) return;

  const existing = await db.offerEvent.findFirst({
    where: {
      shop: input.shop,
      offerId: input.offerId,
      productId: input.productId,
      variantId: input.variantId,
      eventType: OfferEventType.purchased,
      orderId: input.orderId,
      ...(input.lineItemId ? { lineItemId: input.lineItemId } : {}),
    },
    select: { id: true },
  });
  if (existing) return;

  await db.offerEvent.create({
    data: {
      shop: input.shop,
      offerId: input.offerId,
      eventType: OfferEventType.purchased,
      orderId: input.orderId,
      lineItemId: input.lineItemId,
      customerId: input.customerId,
      guestKey: input.customerId ? null : input.guestKey,
      productId: input.productId,
      variantId: input.variantId,
      placement: offer.placement,
      ...(input.revenue ? { revenue: input.revenue } : {}),
    },
  });
}

export async function emitPurchaseShopperEvents(input: {
  shop: string;
  payload: unknown;
}): Promise<{ accepted: number; skipped: number }> {
  if (!input.payload || typeof input.payload !== "object") {
    return { accepted: 0, skipped: 0 };
  }
  const order = input.payload as Record<string, unknown>;
  const orderId = orderIdFromPayload(order);
  const customerId = toGid(
    "Customer",
    getString(
      (order.customer && typeof order.customer === "object"
        ? (order.customer as Record<string, unknown>).id
        : null) ??
        order.customer_id ??
        order.user_id,
    ),
  );
  const cartToken = getString(order.cart_token ?? order.checkout_token ?? order.token);
  const lineItems = Array.isArray(order.line_items) ? order.line_items : [];
  const guestFromLines = lineItems
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const props = lineProperties(item as Record<string, unknown>);
      return getString(props["_upsell_guest_key"] ?? props["upsell_guest_key"]);
    })
    .find((value): value is string => Boolean(value));

  const sessionId = guestFromLines;
  const anonId = cartToken ?? (customerId || sessionId ? null : `order:${orderId}`);
  const resolvedCustomerId =
    customerId ??
    (await resolveCustomerId(input.shop, { sessionId, anonId, customerId }));

  await recordIdentitySighting({
    shop: input.shop,
    sessionId,
    anonId,
    customerId: resolvedCustomerId,
    source: "orders_webhook",
  });

  const rows: ReturnType<typeof toShopperEventCreateData>[] = [];
  let created = 0;
  let skipped = 0;
  const totalPrice = orderTotalPrice(order);
  const currency = getString(order.currency ?? order.presentment_currency);

  const completed = parseShopperEventEnvelope({
    schemaVersion: 1,
    shop: input.shop,
    eventId: `checkout_completed:${orderId}`,
    occurredAt: getString(order.created_at ?? order.processed_at) ?? new Date().toISOString(),
    sessionId,
    customerId: resolvedCustomerId,
    anonId: anonId ?? sessionId,
    consent: { analytics: true, marketing: false },
    name: "checkout_completed",
    source: "orders_webhook",
    surface: "admin",
    context: {
      ...(totalPrice != null ? { cartValue: totalPrice } : {}),
      ...(currency ? { currency } : {}),
    },
  });
  if (completed.ok && allowsAnalyticsPersistence(completed.data)) {
    rows.push(toShopperEventCreateData(completed.data));
  }
  if (rows.length > 0) {
    const completedInsert = await db.shopperEvent.createMany({ data: rows, skipDuplicates: true });
    created += completedInsert.count;
    skipped += rows.length - completedInsert.count;
  }
  if (totalPrice != null) {
    const completedEventId = `checkout_completed:${orderId}`;
    const existingCompleted = await db.shopperEvent.findUnique({
      where: { shop_eventId: { shop: input.shop, eventId: completedEventId } },
    });
    const priorContext =
      existingCompleted?.context && typeof existingCompleted.context === "object"
        ? (existingCompleted.context as Record<string, unknown>)
        : {};
    const priorValue = Number(priorContext.cartValue);
    if (existingCompleted && (!Number.isFinite(priorValue) || priorValue <= 0)) {
      await db.shopperEvent.update({
        where: { id: existingCompleted.id },
        data: {
          context: {
            ...priorContext,
            cartValue: totalPrice,
            ...(currency ? { currency } : {}),
          },
        },
      });
    }
  }

  const occurredAtIso = getString(order.created_at ?? order.processed_at) ?? new Date().toISOString();
  const occurredAt = new Date(occurredAtIso);

  for (const rawLine of lineItems) {
    if (!rawLine || typeof rawLine !== "object") continue;
    const lineItem = rawLine as Record<string, unknown>;
    const lineItemId = getString(lineItem.admin_graphql_api_id ?? lineItem.id) ?? randomUUID();
    const props = lineProperties(lineItem);
    const lineSession = getString(props["_upsell_guest_key"] ?? props["upsell_guest_key"]) ?? sessionId;
    const lineCustomer =
      toGid("Customer", getString(props["_upsell_customer_id"] ?? props["upsell_customer_id"])) ??
      resolvedCustomerId;
    const productId = toGid(
      "Product",
      getString(props["_upsell_product_id"] ?? props["upsell_product_id"] ?? lineItem.product_id),
    );
    const variantId = toGid(
      "ProductVariant",
      getString(props["_upsell_variant_id"] ?? props["upsell_variant_id"] ?? lineItem.variant_id),
    );
    let offerId = getString(props["_upsell_offer_id"] ?? props["upsell_offer_id"]);
    if (!offerId) {
      const attributed = await lastRecommendation({
        shop: input.shop,
        at: occurredAt,
        customerId: lineCustomer,
        sessionId: lineSession,
        anonId,
        productId,
        variantId,
      });
      offerId = attributed?.offerId ?? null;
    }
    const quantity = getString(lineItem.quantity);
    const lineTotal = lineRevenue(lineItem);
    const parsed = parseShopperEventEnvelope({
      schemaVersion: 1,
      shop: input.shop,
      eventId: `purchase:${orderId}:${lineItemId}`,
      occurredAt: occurredAtIso,
      sessionId: lineSession,
      customerId: lineCustomer,
      anonId: anonId ?? lineSession,
      consent: { analytics: true, marketing: false },
      name: "purchase",
      source: "orders_webhook",
      surface: "admin",
      entities: {
        ...(productId ? { productId } : {}),
        ...(variantId ? { variantId } : {}),
        ...(quantity ? { query: quantity } : {}),
      },
      context: {
        ...(lineTotal != null ? { cartValue: Number(lineTotal) } : {}),
        ...(currency ? { currency } : {}),
      },
      attribution: {
        ...(offerId ? { recommendationId: offerId, campaignId: offerId } : {}),
      },
    });
    if (!parsed.ok || !allowsAnalyticsPersistence(parsed.data)) continue;
    const data = toShopperEventCreateData(parsed.data);
    const existing = await db.shopperEvent.findUnique({
      where: { shop_eventId: { shop: data.shop, eventId: data.eventId } },
    });
    if (!existing) {
      await db.shopperEvent.create({ data });
      created += 1;
    } else {
      const priorContext =
        existing.context && typeof existing.context === "object"
          ? (existing.context as Record<string, unknown>)
          : {};
      const priorValue = Number(priorContext.cartValue);
      const needsRevenue = lineTotal != null && (!Number.isFinite(priorValue) || priorValue <= 0);
      const needsAttr = !existing.recommendationId && data.recommendationId;
      if (needsRevenue || needsAttr) {
        await db.shopperEvent.update({
          where: { id: existing.id },
          data: {
            ...(needsAttr
              ? {
                  recommendationId: data.recommendationId,
                  campaignId: data.campaignId,
                  attribution: data.attribution,
                }
              : {}),
            ...(needsRevenue
              ? {
                  context: {
                    ...priorContext,
                    cartValue: Number(lineTotal),
                    ...(currency ? { currency } : {}),
                  },
                }
              : {}),
          },
        });
      } else {
        skipped += 1;
      }
    }

    if (offerId && productId && variantId) {
      await dualWriteOfferPurchased({
        shop: input.shop,
        offerId,
        orderId,
        lineItemId,
        productId,
        variantId,
        customerId: lineCustomer,
        guestKey: lineSession,
        revenue: lineRevenue(lineItem),
      });
    }
  }

  return { accepted: created, skipped };
}
