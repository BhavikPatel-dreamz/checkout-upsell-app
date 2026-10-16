import { corsPreflight, withCors } from "../lib/cors.server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { OfferPlacement } from "@prisma/client";
import { badRequest, methodNotAllowed, readJsonBody } from "../lib/http.server";
import { trackOfferImpression } from "../models/offerAnalytics.server";
import { shopFromVerifiedStorefrontRequest } from "../lib/verifiedShop.server";

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
  const shop = await shopFromVerifiedStorefrontRequest(request);

  if (!shop) {
    return withCors(Response.json({ error: "Unauthorized" }, { status: 401 }), request);
  }

  const offerId = typeof body.offerId === "string" ? body.offerId.trim() : "";
  const productId = typeof body.productId === "string" ? body.productId.trim() : "";
  const variantId = typeof body.variantId === "string" ? body.variantId.trim() : "";
  const placement = parsePlacement(body.placement);

  if (!offerId || !productId || !variantId || !placement) {
    return withCors(badRequest({ body: "offerId, productId, variantId, and placement are required." }), request);
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

  return withCors(Response.json({ counted: result.counted, duplicate: result.duplicate }), request);
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") return corsPreflight(request);
  return withCors(new Response(null, { status: 405 }), request);
};
