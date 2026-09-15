/**
 * Centralized offer definitions.
 *
 * Offer-type configuration and client-safe enum values live in
 * `../config/offerTypes` — re-exported here so every route shares a single
 * source of truth for offer semantics, labels, and display logic.
 */

import { OfferPlacement } from "../config/offerTypes";

export {
  OfferType,
  OfferPlacement,
  OFFER_TYPE_CONFIG,
  COMMON_OFFER_FIELDS,
  DEAL_TYPE_OPTIONS,
  getOfferTypeConfig,
  isOfferType,
  isOfferPlacement,
  normalizeOfferType,
  offerTypeOptions,
  offerRequiresTriggerProducts,
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

/**
 * Maps "Display Upsell on" to the placement storefronts actually query.
 * Cart page uses `checkout`; cart drawer uses `cart_drawer`; thank-you uses `post_purchase`.
 */
export function placementFromDisplayLocation(
  displayLocation: string | undefined,
  fallback: OfferPlacement,
): OfferPlacement {
  switch (displayLocation) {
    case "thank_you_page":
      return OfferPlacement.post_purchase;
    case "product_page":
      return OfferPlacement.product_page;
    case "cart_drawer":
    case "cart_drawer_upsell":
      return OfferPlacement.cart_drawer;
    case "checkout_page":
      return OfferPlacement.checkout;
    default:
      return fallback;
  }
}

/** Short label used in the UI header when creating / editing an offer. */
export function placementHeaderLabel(placement: OfferPlacement): string {
  if (placement === OfferPlacement.post_purchase) return "Post-Purchase";
  if (placement === OfferPlacement.cart_drawer) return "Cart Drawer";
  if (placement === OfferPlacement.product_page) return "Product Page";
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
    case OfferPlacement.cart_drawer:
      return [
        { value: "checkout_page", label: "On Checkout Page" },
        { value: "cart_drawer", label: "On Cart Page" },
        { value: "cart_drawer_upsell", label: "On Cart Drawer" },
      ];
    case OfferPlacement.post_purchase:
      return [{ value: "thank_you_page", label: "On Thank You Page" }];
    case OfferPlacement.product_page:
      return [{ value: "product_page", label: "On Product Page" }];
    default:
      return [{ value: "checkout_page", label: "On Checkout Page" }];
  }
}
