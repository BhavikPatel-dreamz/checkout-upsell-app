import type { LoaderFunctionArgs } from "react-router";
import { OfferPlacement } from "@prisma/client";
import { authenticate } from "../shopify.server";
import { badRequest } from "../lib/http.server";
import { findEligibleCrossSellOffers } from "../models/offerEligibility.server";
import { rankEligibleOffers } from "../models/offerRanker.server";

function isValidShopDomain(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]+\.myshopify\.com$/.test(value);
}

function parseCsvParam(value: string | null): string[] {
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  let shop: string | null = null;
  const url = new URL(request.url);

  // 1. Shopify App Proxy header (X-Shopify-Shop-Domain)
  const proxyShop = request.headers.get("x-shopify-shop-domain");
  if (proxyShop && isValidShopDomain(proxyShop)) {
    shop = proxyShop;
  }

  // 2. Fall back to query param
  if (!shop) {
    const shopParam = url.searchParams.get("shop");
    if (shopParam && isValidShopDomain(shopParam)) {
      shop = shopParam;
    }
  }

  // 3. Try admin session auth (last resort — may throw a redirect)
  if (!shop) {
    try {
      const { session } = await authenticate.admin(request);
      shop = session.shop;
    } catch (e) {
      // unauthenticated — fall through
    }
  }

  if (!shop) {
    return badRequest({ shop: "Shop domain is required." });
  }

  // Required: placement
  const placementParam = url.searchParams.get("placement");
  if (!placementParam) return badRequest({ placement: "placement is required (checkout | cart_drawer | product_page | post_purchase)." });

  const placement =
    placementParam === "post_purchase"
      ? OfferPlacement.post_purchase
      : placementParam === "product_page"
        ? OfferPlacement.product_page
        : placementParam === "cart_drawer"
          ? OfferPlacement.cart_drawer
        : placementParam === "checkout"
          ? OfferPlacement.checkout
          : null;
        if (!placement) return badRequest({ placement: "placement must be one of: checkout, cart_drawer, product_page, post_purchase" });

  // Parse cart product / variant ids
  const productIds = parseCsvParam(url.searchParams.get("productIds"));
  const variantIds = parseCsvParam(url.searchParams.get("variantIds"));
  const excludeProductIds = parseCsvParam(url.searchParams.get("excludeProductIds"));
  const excludeVariantIds = parseCsvParam(url.searchParams.get("excludeVariantIds"));

  if (productIds.length === 0 && variantIds.length === 0) {
    return badRequest({ cart: "At least one of productIds or variantIds is required (comma-separated)." });
  }

  const customerId = url.searchParams.get("customerId")?.trim() || null;
  const guestKey = url.searchParams.get("guestKey")?.trim() || null;
  const clientId = url.searchParams.get("clientId")?.trim() || null;

  const eligible = await findEligibleCrossSellOffers({
    shop,
    placement,
    productIds,
    variantIds,
    excludeProductIds,
    excludeVariantIds,
    identity: { customerId, guestKey, clientId },
  });
  const offers = await rankEligibleOffers({
    shop,
    offers: eligible,
    identity: { customerId, guestKey, clientId },
    max: placement === OfferPlacement.product_page ? eligible.length : undefined,
  });

  return Response.json(
    { offers },
    { headers: { "Access-Control-Allow-Origin": "*" } },
  );
};
