import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { OfferPlacement, OfferEventType } from "@prisma/client";

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getUpsellProperties(lineItem: any): {
  offerId: string | null;
  productId: string | null;
  variantId: string | null;
  customerId: string | null;
  guestKey: string | null;
} {
  const props = lineItem?.properties ?? {};
  const offerId = getString(props?._upsell_offer_id ?? props?.["_upsell_offer_id"]);
  const productId = getString(props?._upsell_product_id ?? props?.["_upsell_product_id"]);
  const variantId = getString(props?._upsell_variant_id ?? props?.["_upsell_variant_id"]);
  const customerId = getString(props?._upsell_customer_id ?? props?.["_upsell_customer_id"]);
  const guestKey = getString(props?._upsell_guest_key ?? props?.["_upsell_guest_key"]);

  return { offerId, productId, variantId, customerId, guestKey };
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const order = payload as Record<string, any>;
  const financialStatus = getString(order?.financial_status ?? order?.processed_financial_status);
  const cancelledAt = getString(order?.cancelled_at ?? order?.cancel_reason ?? order?.status);

  if (financialStatus !== "paid" || cancelledAt === "cancelled") {
    return new Response(null, { status: 200 });
  }

  const orderId = getString(order?.id ?? order?.admin_graphql_api_id ?? order?.name) ?? `order-${Date.now()}`;
  const customerId = getString(order?.customer?.id ?? order?.customer_id ?? order?.user_id);
  const lineItems = Array.isArray(order?.line_items) ? order.line_items : [];

  for (const lineItem of lineItems) {
    const lineItemId = getString(lineItem?.id ?? lineItem?.admin_graphql_api_id);
    const { offerId, productId, variantId, customerId: upsellCustomerId, guestKey } = getUpsellProperties(lineItem);
    if (!offerId || !productId || !variantId) continue;

    const offer = await db.offer.findFirst({
      where: { shop, id: offerId },
      select: { id: true, name: true },
    });
    if (!offer) continue;

    const purchaseIdentityCustomerId = customerId ?? upsellCustomerId ?? null;
    const purchaseGuestKey = !purchaseIdentityCustomerId ? guestKey ?? null : null;
    if (!purchaseIdentityCustomerId && !purchaseGuestKey) continue;

    const existing = await db.offerEvent.findFirst({
      where: {
        shop,
        offerId,
        productId,
        variantId,
        eventType: OfferEventType.purchased,
        orderId,
        ...(lineItemId ? { lineItemId } : {}),
        ...(purchaseIdentityCustomerId ? { customerId: purchaseIdentityCustomerId } : { guestKey: purchaseGuestKey }),
      },
      select: { id: true },
    });

    if (existing) continue;

    await db.offerEvent.create({
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
  }

  return new Response(null, { status: 200 });
};
