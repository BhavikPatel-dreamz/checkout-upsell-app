import { corsPreflight, jsonWithCors } from "../lib/cors.server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { OfferPlacement } from "@prisma/client";
import { authenticate } from "../shopify.server";
import { findEligibleCrossSellOffers } from "../models/offerEligibility.server";
import { rankEligibleOffers } from "../models/offerRanker.server";

function isValidShopDomain(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]+\.myshopify\.com$/.test(value);
}

function parseCsvParam(value: string | null): string[] {
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") return corsPreflight();
  return jsonWithCors({ error: "Method not allowed" }, { status: 405 });
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") return corsPreflight();

  let shop: string | null = null;
  const url = new URL(request.url);

  const proxyShop = request.headers.get("x-shopify-shop-domain");
  if (proxyShop && isValidShopDomain(proxyShop)) {
    shop = proxyShop;
  }

  if (!shop) {
    const shopParam = url.searchParams.get("shop");
    if (shopParam && isValidShopDomain(shopParam)) {
      shop = shopParam;
    }
  }

  if (!shop) {
    try {
      const { session } = await authenticate.admin(request);
      shop = session.shop;
    } catch {
      shop = null;
    }
  }

  if (!shop) {
    return jsonWithCors({ errors: { shop: "Shop domain is required." } }, { status: 400 });
  }

  const placementParam = url.searchParams.get("placement");
  if (!placementParam) {
    return jsonWithCors(
      { errors: { placement: "placement is required (checkout | cart_drawer | product_page | post_purchase)." } },
      { status: 400 },
    );
  }

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
  if (!placement) {
    return jsonWithCors(
      { errors: { placement: "placement must be one of: checkout, cart_drawer, product_page, post_purchase" } },
      { status: 400 },
    );
  }

  const productIds = parseCsvParam(url.searchParams.get("productIds"));
  const variantIds = parseCsvParam(url.searchParams.get("variantIds"));
  const excludeProductIds = parseCsvParam(url.searchParams.get("excludeProductIds"));
  const excludeVariantIds = parseCsvParam(url.searchParams.get("excludeVariantIds"));

  if (productIds.length === 0 && variantIds.length === 0) {
    return jsonWithCors(
      { errors: { cart: "At least one of productIds or variantIds is required (comma-separated)." } },
      { status: 400 },
    );
  }

  const customerId = url.searchParams.get("customerId")?.trim() || null;
  const guestKey = url.searchParams.get("guestKey")?.trim() || null;
  const clientId = url.searchParams.get("clientId")?.trim() || null;
  const displayLocationRaw = url.searchParams.get("displayLocation")?.trim() || "";
  const displayLocation = /^[a-z0-9_]+$/i.test(displayLocationRaw)
    ? displayLocationRaw
    : undefined;

  const eligible = await findEligibleCrossSellOffers({
    shop,
    placement,
    productIds,
    variantIds,
    excludeProductIds,
    excludeVariantIds,
    displayLocation,
    identity: { customerId, guestKey, clientId },
  });
  const offers = await rankEligibleOffers({
    shop,
    offers: eligible,
    identity: { customerId, guestKey, clientId },
    max: placement === OfferPlacement.product_page ? eligible.length : undefined,
  });

  return jsonWithCors({ offers });
};
