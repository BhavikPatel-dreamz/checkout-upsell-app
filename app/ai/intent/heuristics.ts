export const SHOPPER_INTENT_STATES = [
  "EXPLORING",
  "RESEARCHING",
  "COMPARING",
  "HIGH_INTENT",
  "READY_TO_BUY",
  "ABANDONING",
  "RETURNING",
  "LOYAL",
] as const;

export type ShopperIntentStateName = (typeof SHOPPER_INTENT_STATES)[number];

export interface IntentEventLike {
  name: string;
  productId?: string | null;
  occurredAt: Date;
}

export interface IntentSignals {
  distinctProductsViewed: number;
  searches: number;
  collections: number;
  variantSelects: number;
  atc: number;
  removes: number;
  cartViews: number;
  checkoutStarts: number;
  purchases: number;
  purchases90d: number;
  hoursSinceLastEvent: number | null;
  daysSinceOldestEvent: number | null;
}

export interface IntentInference {
  state: ShopperIntentStateName;
  purchaseIntent: number;
  productInterest: number;
  priceSensitivity: number;
  discountSensitivity: number;
  crossSellPotential: number;
  abandonRisk: number;
  recentProductIds: string[];
  purchasedProductIds: string[];
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(1, value);
}

export function collectIntentSignals(events: IntentEventLike[], now = new Date()): IntentSignals {
  const views = new Set<string>();
  let searches = 0;
  let collections = 0;
  let variantSelects = 0;
  let atc = 0;
  let removes = 0;
  let cartViews = 0;
  let checkoutStarts = 0;
  let purchases = 0;
  let purchases90d = 0;
  const cutoff90 = now.getTime() - 90 * 24 * 60 * 60 * 1000;
  let last = 0;
  let oldest = Number.POSITIVE_INFINITY;

  for (const event of events) {
    const at = event.occurredAt.getTime();
    if (at > last) last = at;
    if (at < oldest) oldest = at;
    switch (event.name) {
      case "product_view":
      case "product_click":
        if (event.productId) views.add(event.productId);
        break;
      case "product_search":
        searches += 1;
        break;
      case "collection_view":
        collections += 1;
        break;
      case "variant_select":
      case "size_select":
        variantSelects += 1;
        break;
      case "add_to_cart":
      case "recommendation_add":
        atc += 1;
        break;
      case "remove_from_cart":
        removes += 1;
        break;
      case "cart_view":
        cartViews += 1;
        break;
      case "checkout_started":
        checkoutStarts += 1;
        break;
      case "purchase":
      case "checkout_completed":
      case "recommendation_purchase":
        purchases += 1;
        if (at >= cutoff90) purchases90d += 1;
        break;
      default:
        break;
    }
  }

  return {
    distinctProductsViewed: views.size,
    searches,
    collections,
    variantSelects,
    atc,
    removes,
    cartViews,
    checkoutStarts,
    purchases,
    purchases90d,
    hoursSinceLastEvent: last ? (now.getTime() - last) / 3_600_000 : null,
    daysSinceOldestEvent: Number.isFinite(oldest)
      ? (now.getTime() - oldest) / 86_400_000
      : null,
  };
}

export function inferIntent(events: IntentEventLike[], now = new Date()): IntentInference {
  const signals = collectIntentSignals(events, now);
  const recentProductIds = [
    ...new Set(
      events
        .filter((event) => event.productId && (event.name === "product_view" || event.name === "add_to_cart"))
        .map((event) => event.productId as string),
    ),
  ].slice(-12);
  const purchasedProductIds = [
    ...new Set(
      events
        .filter((event) => event.productId && (event.name === "purchase" || event.name === "checkout_completed"))
        .map((event) => event.productId as string),
    ),
  ].slice(-12);

  const purchaseIntent = clamp01(
    signals.distinctProductsViewed * 0.08 +
      signals.variantSelects * 0.1 +
      signals.atc * 0.22 +
      signals.cartViews * 0.08 +
      signals.checkoutStarts * 0.35 +
      signals.purchases * 0.4 -
      signals.removes * 0.12,
  );
  const abandonRisk = clamp01(
    (signals.checkoutStarts > 0 && signals.purchases === 0 ? 0.45 : 0) +
      (signals.atc > 0 && signals.purchases === 0 ? 0.25 : 0) +
      signals.removes * 0.2,
  );
  const productInterest = clamp01(signals.distinctProductsViewed / 6);
  const priceSensitivity = clamp01(signals.variantSelects * 0.15 + signals.distinctProductsViewed * 0.05);
  const discountSensitivity = clamp01(signals.searches * 0.1);
  const crossSellPotential = clamp01(signals.distinctProductsViewed * 0.12 + signals.atc * 0.1);

  let state: ShopperIntentStateName = "EXPLORING";
  if (signals.purchases90d >= 2) state = "LOYAL";
  else if (
    (signals.checkoutStarts >= 1 || signals.atc >= 1) &&
    signals.purchases === 0 &&
    (signals.removes >= 1 || (signals.hoursSinceLastEvent ?? 0) >= 0.5)
  ) {
    state = "ABANDONING";
  } else if (signals.checkoutStarts >= 1 && signals.purchases === 0) state = "READY_TO_BUY";
  else if (signals.atc >= 1 || signals.variantSelects >= 2) state = "HIGH_INTENT";
  else if (signals.distinctProductsViewed >= 3) state = "COMPARING";
  else if (signals.searches >= 1 || signals.collections >= 1 || signals.distinctProductsViewed >= 2) {
    state = "RESEARCHING";
  } else if ((signals.daysSinceOldestEvent ?? 0) >= 7 && events.length >= 2) state = "RETURNING";

  return {
    state,
    purchaseIntent,
    productInterest,
    priceSensitivity,
    discountSensitivity,
    crossSellPotential,
    abandonRisk,
    recentProductIds,
    purchasedProductIds,
  };
}
