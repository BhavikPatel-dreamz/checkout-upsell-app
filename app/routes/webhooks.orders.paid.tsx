import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { OfferPlacement, OfferEventType } from "@prisma/client";

function getString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  // Shopify REST webhook payloads deliver ids as numbers.
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * Line item properties arrive in different shapes depending on payload source:
 * - REST webhooks: [{ name, value }]
 * - GraphQL sources: customAttributes as [{ key, value }]
 * - Cart AJAX / some integrations: flat object map
 */
function getLineItemProperties(lineItem: any): Record<string, string> {
  const raw = lineItem?.properties ?? lineItem?.customAttributes ?? [];
  const props: Record<string, string> = {};
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const key = getString(entry?.name ?? entry?.key);
      if (!key) continue;
      props[key] = getString(entry?.value) ?? "";
    }
  } else if (raw && typeof raw === "object") {
    for (const [key, value] of Object.entries(raw)) {
      props[key] = getString(value) ?? "";
    }
  }
  return props;
}

function getUpsellProperties(lineItem: any): {
  offerId: string | null;
  productId: string | null;
  variantId: string | null;
  customerId: string | null;
  guestKey: string | null;
} {
  const props = getLineItemProperties(lineItem);
  return {
    offerId: getString(props["_upsell_offer_id"]),
    productId: getString(props["_upsell_product_id"]),
    variantId: getString(props["_upsell_variant_id"]),
    customerId: getString(props["_upsell_customer_id"]),
    guestKey: getString(props["_upsell_guest_key"]),
  };
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop, topic } = await authenticate.webhook(request);
  console.log(`[orders/paid] webhook received: topic=${topic} shop=${shop}`);

  const order = payload as Record<string, any>;
  const financialStatus = getString(order?.financial_status ?? order?.processed_financial_status);
  const isCancelled =
    Boolean(getString(order?.cancelled_at)) ||
    getString(order?.cancel_reason) === "cancelled";

  const orderId =
    getString(order?.admin_graphql_api_id ?? order?.id ?? order?.name) ??
    `order-${Date.now()}`;
  console.log(
    `[orders/paid] order=${orderId} financialStatus=${financialStatus ?? "unknown"} cancelled=${isCancelled}`,
  );

  if (financialStatus !== "paid" || isCancelled) {
    console.log(`[orders/paid] skipped (not a paid order)`);
    return new Response(null, { status: 200 });
  }

  const customerId = getString(order?.customer?.id ?? order?.customer_id ?? order?.user_id);
  const lineItems = Array.isArray(order?.line_items) ? order.line_items : [];
  console.log(`[orders/paid] order=${orderId} lineItems=${lineItems.length}`);

  let insertFailure = false;

  for (const lineItem of lineItems) {
    const lineItemId = getString(lineItem?.admin_graphql_api_id ?? lineItem?.id);
    const lineProductId = getString(lineItem?.product_id);
    const lineVariantId = getString(lineItem?.variant_id);
    const { offerId, productId, variantId, customerId: upsellCustomerId, guestKey } =
      getUpsellProperties(lineItem);

    console.log(
      `[orders/paid] order=${orderId} lineItem=${lineItemId ?? "n/a"} product=${lineProductId ?? "n/a"} variant=${lineVariantId ?? "n/a"} ` +
        `attrs(_upsell_offer_id=${offerId ? "yes" : "no"}, _upsell_product_id=${productId ? "yes" : "no"}, _upsell_variant_id=${variantId ? "yes" : "no"})`,
    );

    if (!offerId || !productId || !variantId) {
      console.log(`[orders/paid] order=${orderId} lineItem=${lineItemId ?? "n/a"} not an upsell line, skipping`);
      continue;
    }
    console.log(`[orders/paid] order=${orderId} lineItem=${lineItemId ?? "n/a"} identified as upsell line`);

    let offer: { id: string; name: string } | null = null;
    try {
      offer = await db.offer.findFirst({
        where: { shop, id: offerId },
        select: { id: true, name: true },
      });
    } catch (err: any) {
      insertFailure = true;
      console.error(`[orders/paid] offer lookup failed: ${err?.message ?? err}`);
      continue;
    }
    if (!offer) {
      console.log(`[orders/paid] order=${orderId} offer=${offerId} not found for shop, skipping`);
      continue;
    }

    const purchaseIdentityCustomerId = customerId ?? upsellCustomerId ?? null;
    const purchaseGuestKey = !purchaseIdentityCustomerId ? guestKey ?? null : null;
    if (!purchaseIdentityCustomerId && !purchaseGuestKey) {
      console.log(`[orders/paid] order=${orderId} lineItem=${lineItemId ?? "n/a"} no customer/guest identity, skipping`);
      continue;
    }

    try {
      const existing = await db.offerEvent.findFirst({
        where: {
          shop,
          offerId,
          productId,
          variantId,
          eventType: OfferEventType.purchased,
          orderId,
          ...(lineItemId ? { lineItemId } : {}),
          ...(purchaseIdentityCustomerId
            ? { customerId: purchaseIdentityCustomerId }
            : { guestKey: purchaseGuestKey }),
        },
        select: { id: true },
      });

      if (existing) {
        console.log(
          `[orders/paid] order=${orderId} lineItem=${lineItemId ?? "n/a"} duplicate purchased event ${existing.id}, skipping`,
        );
        continue;
      }

      console.log(`[orders/paid] order=${orderId} lineItem=${lineItemId ?? "n/a"} attempting purchased OfferEvent create`);
      const created = await db.offerEvent.create({
        data: {
          shop,
          offerId,
          eventType: OfferEventType.purchased,
          orderId,
          lineItemId: lineItemId ?? null,
          customerId: purchaseIdentityCustomerId,
          guestKey: purchaseGuestKey,
          productId,
          variantId,
          placement: OfferPlacement.checkout,
        },
      });
      console.log(`[orders/paid] order=${orderId} purchased OfferEvent created id=${created.id}`);
    } catch (err: any) {
      insertFailure = true;
      console.error(
        `[orders/paid] order=${orderId} lineItem=${lineItemId ?? "n/a"} purchased event creation failed: ${err?.message ?? err}`,
      );
    }
  }

  // Non-2xx asks Shopify to redeliver; dedupe logic makes retries safe.
  if (insertFailure) {
    return new Response(null, { status: 500 });
  }
  return new Response(null, { status: 200 });
};
