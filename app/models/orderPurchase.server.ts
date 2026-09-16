import { randomUUID } from "node:crypto";
import db from "../db.server";
import {
  allowsAnalyticsPersistence,
  parseShopperEventEnvelope,
  toShopperEventCreateData,
} from "../ai/events/envelope";
import { recordIdentitySighting } from "../ai/events/identity.server";

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

  await recordIdentitySighting({
    shop: input.shop,
    sessionId,
    anonId,
    customerId,
    source: "orders_webhook",
  });

  const rows: ReturnType<typeof toShopperEventCreateData>[] = [];
  const totalPrice = getString(order.total_price);
  const currency = getString(order.currency ?? order.presentment_currency);

  const completed = parseShopperEventEnvelope({
    schemaVersion: 1,
    shop: input.shop,
    eventId: `checkout_completed:${orderId}`,
    occurredAt: getString(order.created_at ?? order.processed_at) ?? new Date().toISOString(),
    sessionId,
    customerId,
    anonId: anonId ?? sessionId,
    consent: { analytics: true, marketing: false },
    name: "checkout_completed",
    source: "orders_webhook",
    surface: "admin",
    context: {
      ...(totalPrice && Number.isFinite(Number(totalPrice))
        ? { cartValue: Number(totalPrice) }
        : {}),
      ...(currency ? { currency } : {}),
    },
  });
  if (completed.ok && allowsAnalyticsPersistence(completed.data)) {
    rows.push(toShopperEventCreateData(completed.data));
  }

  for (const rawLine of lineItems) {
    if (!rawLine || typeof rawLine !== "object") continue;
    const lineItem = rawLine as Record<string, unknown>;
    const lineItemId = getString(lineItem.admin_graphql_api_id ?? lineItem.id) ?? randomUUID();
    const props = lineProperties(lineItem);
    const productId = toGid(
      "Product",
      getString(props["_upsell_product_id"] ?? props["upsell_product_id"] ?? lineItem.product_id),
    );
    const variantId = toGid(
      "ProductVariant",
      getString(props["_upsell_variant_id"] ?? props["upsell_variant_id"] ?? lineItem.variant_id),
    );
    const offerId = getString(props["_upsell_offer_id"] ?? props["upsell_offer_id"]);
    const quantity = getString(lineItem.quantity);
    const parsed = parseShopperEventEnvelope({
      schemaVersion: 1,
      shop: input.shop,
      eventId: `purchase:${orderId}:${lineItemId}`,
      occurredAt: getString(order.created_at ?? order.processed_at) ?? new Date().toISOString(),
      sessionId: getString(props["_upsell_guest_key"] ?? props["upsell_guest_key"]) ?? sessionId,
      customerId:
        toGid("Customer", getString(props["_upsell_customer_id"] ?? props["upsell_customer_id"])) ??
        customerId,
      anonId: anonId ?? sessionId,
      consent: { analytics: true, marketing: false },
      name: "purchase",
      source: "orders_webhook",
      surface: "admin",
      entities: {
        ...(productId ? { productId } : {}),
        ...(variantId ? { variantId } : {}),
        ...(quantity ? { query: quantity } : {}),
      },
      attribution: {
        ...(offerId ? { recommendationId: offerId, campaignId: offerId } : {}),
      },
    });
    if (!parsed.ok || !allowsAnalyticsPersistence(parsed.data)) continue;
    rows.push(toShopperEventCreateData(parsed.data));
  }

  if (rows.length === 0) return { accepted: 0, skipped: 0 };
  const result = await db.shopperEvent.createMany({ data: rows, skipDuplicates: true });
  return { accepted: result.count, skipped: rows.length - result.count };
}
