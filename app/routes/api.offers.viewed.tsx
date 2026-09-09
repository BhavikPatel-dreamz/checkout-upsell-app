import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { OfferPlacement } from "@prisma/client";
import { badRequest, methodNotAllowed, readJsonBody } from "../lib/http.server";
import { trackOfferImpression } from "../models/offerAnalytics.server";

function isValidShopDomain(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]+\.myshopify\.com$/.test(value);
}

function parsePlacement(value: unknown): OfferPlacement | null {
  if (value === "checkout") return OfferPlacement.checkout;
  if (value === "product_page") return OfferPlacement.product_page;
  if (value === "post_purchase") return OfferPlacement.post_purchase;
  return null;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const CORS_HEADERS = new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Shopify-Shop-Domain",
  });
  function withCors(response: Response) {
    CORS_HEADERS.forEach((v, k) => response.headers.set(k, v));
    return response;
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") return withCors(methodNotAllowed());

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return withCors(badRequest({ body: "Request body must be valid JSON." }));

  const body = parsed.body as Record<string, unknown>;
  const shop =
    (typeof body.shop === "string" && isValidShopDomain(body.shop) ? body.shop : null) ??
    (request.headers.get("x-shopify-shop-domain") && isValidShopDomain(request.headers.get("x-shopify-shop-domain"))
      ? request.headers.get("x-shopify-shop-domain")
      : null) ??
    new URL(request.url).searchParams.get("shop");

  if (!shop || !isValidShopDomain(shop)) {
    return withCors(badRequest({ shop: "Shop domain is required." }));
  }

  const offerId = typeof body.offerId === "string" ? body.offerId.trim() : "";
  const productId = typeof body.productId === "string" ? body.productId.trim() : "";
  const variantId = typeof body.variantId === "string" ? body.variantId.trim() : "";
  const placement = parsePlacement(body.placement);

  if (!offerId || !productId || !variantId || !placement) {
    return withCors(badRequest({ body: "offerId, productId, variantId, and placement are required." }));
  }

  const result = await trackOfferImpression({
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

  return withCors(Response.json({ counted: result.counted, duplicate: result.duplicate }));
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const CORS_HEADERS = new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Shopify-Shop-Domain",
  });

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  return new Response(null, { status: 405, headers: CORS_HEADERS });
};
