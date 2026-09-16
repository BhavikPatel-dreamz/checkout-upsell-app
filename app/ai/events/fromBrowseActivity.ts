import type { BrowseActivityType } from "@prisma/client";
import type { ShopperEventName } from "./envelope";
import {
  allowsAnalyticsPersistence,
  parseShopperEventEnvelope,
  toShopperEventCreateData,
} from "./envelope";

const BROWSE_TO_SHOPPER_NAME: Partial<Record<BrowseActivityType, ShopperEventName>> = {
  product_viewed: "product_view",
  collection_viewed: "collection_view",
  search_submitted: "product_search",
  product_added_to_cart: "add_to_cart",
  variant_changed: "variant_select",
};

const BROWSE_TO_SOURCE: Partial<Record<BrowseActivityType, string>> = {
  product_viewed: "product_page",
  collection_viewed: "collection",
  search_submitted: "search",
  product_added_to_cart: "cart",
  variant_changed: "product_page",
};

export function shopperEventNameForBrowseActivity(
  eventType: BrowseActivityType,
): ShopperEventName | null {
  return BROWSE_TO_SHOPPER_NAME[eventType] ?? null;
}

export function browseActivityToShopperCreateData(input: {
  shop: string;
  eventId: string;
  eventType: BrowseActivityType;
  occurredAt: Date;
  customerId: string | null;
  guestKey: string | null;
  clientId: string | null;
  productId: string | null;
  variantId: string | null;
  collectionId: string | null;
  query: string | null;
}) {
  const name = shopperEventNameForBrowseActivity(input.eventType);
  if (!name) return null;

  const parsed = parseShopperEventEnvelope({
    schemaVersion: 1,
    shop: input.shop,
    eventId: input.eventId,
    occurredAt: input.occurredAt,
    sessionId: input.guestKey,
    customerId: input.customerId,
    anonId: input.clientId ?? input.guestKey,
    consent: { analytics: true, marketing: false },
    name,
    source: BROWSE_TO_SOURCE[input.eventType],
    surface: "pixel",
    entities: {
      ...(input.productId ? { productId: input.productId } : {}),
      ...(input.variantId ? { variantId: input.variantId } : {}),
      ...(input.collectionId ? { collectionId: input.collectionId } : {}),
      ...(input.query ? { query: input.query } : {}),
    },
  });

  if (!parsed.ok) return null;
  if (!allowsAnalyticsPersistence(parsed.data)) return null;
  return toShopperEventCreateData(parsed.data);
}
