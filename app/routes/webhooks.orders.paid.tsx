/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { OfferPlacement, OfferEventType, Prisma } from "@prisma/client";

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

function getLineItemRevenue(lineItem: any): Prisma.Decimal | null {
  const priceRaw = getString(lineItem?.price ?? lineItem?.total_price);
  if (!priceRaw) return null;

  const price = Number.parseFloat(priceRaw);
  if (!Number.isFinite(price)) return null;

  const quantityRaw = getString(lineItem?.quantity);
  const quantity = Number.parseInt(quantityRaw ?? "1", 10);
  const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;

  const amount = price * safeQuantity;
  if (amount < 0) return null;

  return new Prisma.Decimal(amount.toFixed(2));
}

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log(`[orders/paid] ===== webhook request received at ${new Date().toISOString()} =====`);

  let payload: unknown;
  let shop: string;
  let topic: string;

  try {
    const authResult = await authenticate.webhook(request);
    payload = authResult.payload;
    shop = authResult.shop;
    topic = authResult.topic;
  } catch (err: any) {
    console.error(`[orders/paid] authenticate.webhook FAILED: ${err?.message ?? err}`);
    console.error(err?.stack ?? "(no stack)");
    // Return 401 so Shopify knows this wasn't processed; do not retry loop indefinitely
    // on a bad signature, but do surface the failure loudly in logs.
    return new Response(null, { status: 401 });
  }

  console.log(`[orders/paid] authenticated OK: topic=${topic} shop=${shop}`);
  console.log(`[orders/paid] raw payload keys: ${Object.keys(payload as object).join(", ")}`);
  console.log(`[orders/paid] FULL PAYLOAD:\n${JSON.stringify(payload, null, 2)}`);

  const order = payload as Record<string, any>;
  const financialStatus = getString(order?.financial_status ?? order?.processed_financial_status);
  const isCancelled =
    Boolean(getString(order?.cancelled_at)) ||
    getString(order?.cancel_reason) === "cancelled";

  const orderId =
    getString(order?.admin_graphql_api_id ?? order?.id ?? order?.name) ??
    `order-${Date.now()}`;

  console.log(
    `[orders/paid] order=${orderId} financialStatus=${financialStatus ?? "unknown"} ` +
    `cancelled_at=${order?.cancelled_at ?? "null"} cancel_reason=${order?.cancel_reason ?? "null"} ` +
    `isCancelled=${isCancelled}`,
  );

  if (financialStatus !== "paid" || isCancelled) {
    console.log(
      `[orders/paid] order=${orderId} SKIPPED — reason: ` +
      `${financialStatus !== "paid" ? `financial_status is "${financialStatus}", expected "paid"` : ""}` +
      `${isCancelled ? " order is cancelled" : ""}`,
    );
    return new Response(null, { status: 200 });
  }

  const customerId = getString(order?.customer?.id ?? order?.customer_id ?? order?.user_id);
  const lineItems = Array.isArray(order?.line_items) ? order.line_items : [];
  console.log(`[orders/paid] order=${orderId} customerId=${customerId ?? "guest/none"} lineItems=${lineItems.length}`);
  console.log(`[orders/paid] order=${orderId} rawOrderProperties=${JSON.stringify({ financialStatus, customerId, orderId })}`);

  if (lineItems.length === 0) {
    console.log(`[orders/paid] order=${orderId} WARNING — line_items array is empty. Nothing to process.`);
  }

  // Quick DB connectivity check up front so a dead DB is obvious immediately
  // rather than buried inside the per-line-item try/catch below.
  try {
    await db.$queryRaw`SELECT 1`;
    console.log(`[orders/paid] order=${orderId} DB connectivity check: OK`);
  } catch (dbErr: any) {
    console.error(`[orders/paid] order=${orderId} DB connectivity check FAILED: ${dbErr?.message ?? dbErr}`);
    console.error(`[orders/paid] order=${orderId} This usually means your DATABASE_URL is stale, or your Neon/Postgres instance is paused/unreachable.`);
    return new Response(null, { status: 500 });
  }

  let insertFailure = false;

  for (const [index, lineItem] of lineItems.entries()) {
    console.log(`[orders/paid] order=${orderId} ----- processing line item ${index + 1}/${lineItems.length} -----`);

    const lineItemId = getString(lineItem?.admin_graphql_api_id ?? lineItem?.id);
    const lineProductId = getString(lineItem?.product_id);
    const lineVariantId = getString(lineItem?.variant_id);
    const lineProps = getLineItemProperties(lineItem);
    const { offerId, productId, variantId, customerId: upsellCustomerId, guestKey } =
      getUpsellProperties(lineItem);

    console.log(
      `[orders/paid] order=${orderId} lineItem=${lineItemId ?? "n/a"} product=${lineProductId ?? "n/a"} variant=${lineVariantId ?? "n/a"} title=${getString(lineItem?.title) ?? "n/a"}`,
    );
    console.log(`[orders/paid] order=${orderId} lineItem=${lineItemId ?? "n/a"} rawProperties=${JSON.stringify(lineProps)}`);
    console.log(
      `[orders/paid] order=${orderId} lineItem=${lineItemId ?? "n/a"} parsedUpsellAttrs: ` +
      `offerId=${offerId ?? "MISSING"} productId=${productId ?? "MISSING"} variantId=${variantId ?? "MISSING"} ` +
      `upsellCustomerId=${upsellCustomerId ?? "none"} guestKey=${guestKey ?? "none"}`,
    );

    if (!offerId || !productId || !variantId) {
      console.log(
        `[orders/paid] order=${orderId} lineItem=${lineItemId ?? "n/a"} SKIPPED — missing required upsell properties ` +
        `(this line item was not added via the thank-you upsell flow, or properties were dropped somewhere before checkout).`,
      );
      continue;
    }
    console.log(`[orders/paid] order=${orderId} lineItem=${lineItemId ?? "n/a"} identified as upsell line, looking up offer...`);

    let offer: { id: string; name: string; placement: OfferPlacement } | null = null;
    try {
      offer = await db.offer.findFirst({
        where: { shop, id: offerId },
        select: { id: true, name: true, placement: true },
      });
      console.log(`[orders/paid] order=${orderId} lineItem=${lineItemId ?? "n/a"} offer lookup result: ${offer ? `found "${offer.name}" (placement=${offer.placement})` : "NOT FOUND"}`);
    } catch (err: any) {
      insertFailure = true;
      console.error(`[orders/paid] order=${orderId} lineItem=${lineItemId ?? "n/a"} offer lookup FAILED: ${err?.message ?? err}`);
      console.error(err?.stack ?? "(no stack)");
      continue;
    }
    if (!offer) {
      console.log(
        `[orders/paid] order=${orderId} lineItem=${lineItemId ?? "n/a"} SKIPPED — offer id "${offerId}" not found for shop "${shop}". ` +
        `Check that the offer still exists and wasn't deleted, and that offerId matches exactly.`,
      );
      continue;
    }

    const purchaseIdentityCustomerId = customerId ?? upsellCustomerId ?? null;
    const purchaseGuestKey = !purchaseIdentityCustomerId ? guestKey ?? null : null;
    console.log(
      `[orders/paid] order=${orderId} lineItem=${lineItemId ?? "n/a"} resolved identity: ` +
      `customerId=${purchaseIdentityCustomerId ?? "none"} guestKey=${purchaseGuestKey ?? "none"}`,
    );
    if (!purchaseIdentityCustomerId && !purchaseGuestKey) {
      console.log(`[orders/paid] order=${orderId} lineItem=${lineItemId ?? "n/a"} SKIPPED — no customer/guest identity available to attribute this purchase to.`);
      continue;
    }

    const lineItemRevenue = getLineItemRevenue(lineItem);
    console.log(`[orders/paid] order=${orderId} lineItem=${lineItemId ?? "n/a"} computed revenue=${lineItemRevenue?.toString() ?? "null"} (price=${lineItem?.price ?? lineItem?.total_price ?? "n/a"}, qty=${lineItem?.quantity ?? "n/a"})`);

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
          `[orders/paid] order=${orderId} lineItem=${lineItemId ?? "n/a"} SKIPPED — duplicate purchased event already exists (id=${existing.id}). This is expected on webhook retries.`,
        );
        continue;
      }

      const eventPlacement = offer.placement ?? OfferPlacement.checkout;
      console.log(`[orders/paid] order=${orderId} lineItem=${lineItemId ?? "n/a"} no existing event found, creating purchased OfferEvent (placement=${eventPlacement})...`);
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
          placement: eventPlacement,
          ...(lineItemRevenue ? { revenue: lineItemRevenue } : {}),
        },
      });
      console.log(`[orders/paid] order=${orderId} lineItem=${lineItemId ?? "n/a"} ✅ SUCCESS — purchased OfferEvent created, id=${created.id}, revenue=${created.revenue?.toString() ?? "n/a"}`);
    } catch (err: any) {
      insertFailure = true;
      console.error(
        `[orders/paid] order=${orderId} lineItem=${lineItemId ?? "n/a"} ❌ purchased event creation FAILED: ${err?.message ?? err}`,
      );
      console.error(err?.stack ?? "(no stack)");
    }
  }

  console.log(`[orders/paid] order=${orderId} ===== finished processing, insertFailure=${insertFailure} =====`);

  // Non-2xx asks Shopify to redeliver; dedupe logic makes retries safe.
  if (insertFailure) {
    return new Response(null, { status: 500 });
  }
  return new Response(null, { status: 200 });
};