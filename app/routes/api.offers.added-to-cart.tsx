import type { ActionFunctionArgs } from "react-router";
import { OfferPlacement } from "@prisma/client";
import { badRequest, methodNotAllowed, readJsonBody } from "../lib/http.server";
import { trackOfferAddedToCart } from "../models/offerAnalytics.server";

function isValidShopDomain(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]+\.myshopify\.com$/.test(value);
}

function parsePlacement(value: unknown): OfferPlacement | null {
  if (value === "checkout") return OfferPlacement.checkout;
  if (value === "post_purchase") return OfferPlacement.post_purchase;
  return null;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") return methodNotAllowed();

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return badRequest({ body: "Request body must be valid JSON." });

  const body = parsed.body as Record<string, unknown>;
  const shop =
    (typeof body.shop === "string" && isValidShopDomain(body.shop) ? body.shop : null) ??
    (request.headers.get("x-shopify-shop-domain") && isValidShopDomain(request.headers.get("x-shopify-shop-domain"))
      ? request.headers.get("x-shopify-shop-domain")
      : null) ??
    new URL(request.url).searchParams.get("shop");

  if (!shop || !isValidShopDomain(shop)) {
    return badRequest({ shop: "Shop domain is required." });
  }

  const offerId = typeof body.offerId === "string" ? body.offerId.trim() : "";
  const productId = typeof body.productId === "string" ? body.productId.trim() : "";
  const variantId = typeof body.variantId === "string" ? body.variantId.trim() : "";
  const placement = parsePlacement(body.placement);

  if (!offerId || !productId || !variantId || !placement) {
    return badRequest({ body: "offerId, productId, variantId, and placement are required." });
  }

  const result = await trackOfferAddedToCart({
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

  return Response.json({ counted: result.counted, duplicate: result.duplicate });
};
