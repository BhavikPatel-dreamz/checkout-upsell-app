import { corsPreflight, jsonWithCors } from "../lib/cors.server";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { OfferPlacement } from "@prisma/client";
import { findEligibleCrossSellOffers } from "../models/offerEligibility.server";
import { rankEligibleOffers } from "../models/offerRanker.server";
import { shopFromVerifiedStorefrontRequest } from "../lib/verifiedShop.server";

function parseCsvParam(value: string | null): string[] {
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") return corsPreflight(request);
  return jsonWithCors({ error: "Method not allowed" }, { status: 405 }, request);
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") return corsPreflight(request);

  const shop = await shopFromVerifiedStorefrontRequest(request);
  const url = new URL(request.url);

  if (!shop) {
    return jsonWithCors({ error: "Unauthorized" }, { status: 401 }, request);
  }

  const placementParam = url.searchParams.get("placement");
  if (!placementParam) {
    return jsonWithCors(
      { errors: { placement: "placement is required (checkout | cart_drawer | product_page | post_purchase)." } },
      { status: 400 },
      request,
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
      request,
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
      request,
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

  console.info("[DD Upsell eligible]", {
    shop,
    placement,
    displayLocation,
    productIds,
    variantIds,
    eligible: eligible.length,
    ranked: offers.length,
    names: offers.map((row) => row.offerName ?? row.offerId),
  });

  return jsonWithCors({ offers }, undefined, request);
};
