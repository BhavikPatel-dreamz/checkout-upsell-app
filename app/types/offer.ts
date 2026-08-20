/**
 * Centralized offer definitions.
 *
 * The canonical offer types and placements live in the Prisma schema
 * (OfferType / OfferPlacement enums). Offer-type configuration and helpers
 * live in `../config/offerTypes` — re-exported here so every route shares a
 * single source of truth for offer semantics, labels, and display logic.
 */

import { OfferPlacement } from "@prisma/client";

export { OfferPlacement };
export {
  OfferType,
  OFFER_TYPE_CONFIG,
  COMMON_OFFER_FIELDS,
  DEAL_TYPE_OPTIONS,
  getOfferTypeConfig,
  isOfferType,
  isOfferPlacement,
  normalizeOfferType,
  offerTypeOptions,
} from "../config/offerTypes";

/** Human-readable labels for each offer placement. */
export const PLACEMENT_LABELS: Record<OfferPlacement, string> = {
  [OfferPlacement.product_page]: "Product Page",
  [OfferPlacement.cart_drawer]: "Cart Drawer",
  [OfferPlacement.checkout]: "Pre-Purchase (Checkout)",
  [OfferPlacement.post_purchase]: "Post-Purchase (Thank You Page)",
  [OfferPlacement.order_status]: "Order Status",
};

/**
 * Maps the legacy `upsellType` form value to the canonical OfferPlacement.
 * Backward-compatible with data already stored in triggerRules.
 */
export function placementFromUpsellType(upsellType?: string): OfferPlacement {
  if (upsellType === "post-purchase") return OfferPlacement.post_purchase;
  return OfferPlacement.checkout;
}

/** Short label used in the UI header when creating / editing an offer. */
export function placementHeaderLabel(placement: OfferPlacement): string {
  if (placement === OfferPlacement.post_purchase) return "Post-Purchase";
  return "Pre-Purchase";
}

// ── Display-location options ──────────────────────────────────────────

export interface DisplayLocationOption {
  value: string;
  label: string;
}

/** Returns the available "Display Upsell on" options for a given placement. */
export function displayLocationOptions(
  placement: OfferPlacement,
): DisplayLocationOption[] {
  switch (placement) {
    case OfferPlacement.checkout:
      return [
        { value: "checkout_page", label: "On Checkout Page" },
        { value: "cart_drawer", label: "On Cart Page" },
      ];
    case OfferPlacement.post_purchase:
      return [{ value: "thank_you_page", label: "On Thank You Page" }];
    case OfferPlacement.product_page:
      return [{ value: "product_page", label: "On Product Page" }];
    default:
      return [{ value: "checkout_page", label: "On Checkout Page" }];
  }
}
