import { corsPreflight, withCors } from "../lib/cors.server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { OfferPlacement } from "@prisma/client";
import { badRequest, methodNotAllowed, readJsonBody } from "../lib/http.server";
import { trackOfferClick } from "../models/offerAnalytics.server";

function isValidShopDomain(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]+\.myshopify\.com$/.test(value);
}

function parsePlacement(value: unknown): OfferPlacement | null {
  if (value === "checkout") return OfferPlacement.checkout;
  if (value === "cart_drawer") return OfferPlacement.cart_drawer;
  if (value === "product_page") return OfferPlacement.product_page;
  if (value === "post_purchase") return OfferPlacement.post_purchase;
  return null;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") return corsPreflight(request);
  if (request.method !== "POST") return withCors(methodNotAllowed(), request);

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return withCors(badRequest({ body: "Request body must be valid JSON." }), request);

  const body = parsed.body as Record<string, unknown>;
  const shop =
    (typeof body.shop === "string" && isValidShopDomain(body.shop) ? body.shop : null) ??
    (request.headers.get("x-shopify-shop-domain") && isValidShopDomain(request.headers.get("x-shopify-shop-domain"))
      ? request.headers.get("x-shopify-shop-domain")
      : null) ??
    new URL(request.url).searchParams.get("shop");

  if (!shop || !isValidShopDomain(shop)) {
    return withCors(badRequest({ shop: "Shop domain is required." }), request);
  }

  const offerId = typeof body.offerId === "string" ? body.offerId.trim() : "";
  const productId = typeof body.productId === "string" ? body.productId.trim() : "";
  const variantId = typeof body.variantId === "string" ? body.variantId.trim() : "";
  const placement = parsePlacement(body.placement);

  if (!offerId || !productId || !variantId || !placement) {
    return withCors(badRequest({ body: "offerId, productId, variantId, and placement are required." }), request);
  }

  const result = await trackOfferClick({
    shop,
    offerId,
    offerName: typeof body.offerName === "string" ? body.offerName : null,
    productId,
    variantId,
    placement,
    customerId: typeof body.customerId === "string" && body.customerId.trim() ? body.customerId.trim() : null,
    guestKey: typeof body.guestKey === "string" && body.guestKey.trim() ? body.guestKey.trim() : null,
    isGuest: body.isGuest === true || (typeof body.customerId !== "string" && typeof body.guestKey === "string"),
  });

  return withCors(Response.json({ counted: result.counted, duplicate: result.duplicate }), request);
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") return corsPreflight(request);
  return withCors(new Response(null, { status: 405 }), request);
};
