/**
 * Centralized offer type configuration.
 *
 * This module is the single source of truth for how each offer type is
 * labelled, described, and which fields its form renders. Adding a new offer
 * type later means adding one entry to `OFFER_TYPE_CONFIG` — no new route,
 * no new complete form, no duplicated action.
 */

// This module is imported by browser components, so it must not import Prisma.
// Keep these values aligned with the Prisma enums in `schema.prisma`.
export const OfferType = {
  cross_sell: "cross_sell",
  bundle: "bundle",
  volume: "volume",
  free_gift: "free_gift",
  subscription: "subscription",
  ai_recommend: "ai_recommend",
} as const;

export type OfferType = (typeof OfferType)[keyof typeof OfferType];

export const OfferPlacement = {
  product_page: "product_page",
  cart_drawer: "cart_drawer",
  checkout: "checkout",
  post_purchase: "post_purchase",
  order_status: "order_status",
} as const;

export type OfferPlacement =
  (typeof OfferPlacement)[keyof typeof OfferPlacement];


/** Field ids the unified offer form can render. */
export type OfferFieldId =
  | "title"
  | "showUpsell"
  | "displayLocation"
  | "upsellProduct"
  | "dealType"
  | "schedule"
  | "promotionalTitle";

export interface OfferTypeConfig {
  label: string;
  description: string;
  /** Placement used when creating this type without an explicit placement. */
  defaultPlacement: OfferPlacement;
  /** The ordered list of fields the unified form renders for this type. */
  fields: OfferFieldId[];
  /** Cart must contain at least one configured trigger product. */
  requiresTriggerProducts?: boolean;
  /** Upsell SKUs must be a merchant-picked pool (no Shopify related-item mode). */
  poolOnly?: boolean;
}

/**
 * Fields shared by every offer type. They are always rendered by
 * `CommonOfferFields`; the rest of a type's `fields` list is rendered by the
 * type-specific section of the unified form.
 */
export const COMMON_OFFER_FIELDS: OfferFieldId[] = [
  "title",
  "showUpsell",
  "displayLocation",
  "schedule",
  "promotionalTitle",
];

export const OFFER_TYPE_CONFIG: Record<OfferType, OfferTypeConfig> = {
  cross_sell: {
    label: "Cross-Sell",
    description: "Suggest a related product when an item is added to the cart.",
    defaultPlacement: OfferPlacement.checkout,
    fields: [...COMMON_OFFER_FIELDS, "upsellProduct", "dealType"],
    requiresTriggerProducts: true,
  },
  bundle: {
    label: "Bundle",
    description: "Offer a discounted bundle of products.",
    defaultPlacement: OfferPlacement.checkout,
    fields: [...COMMON_OFFER_FIELDS, "upsellProduct", "dealType"],
  },
  volume: {
    label: "Quantity Discount",
    description: "Reward larger quantities with a discount.",
    defaultPlacement: OfferPlacement.checkout,
    fields: [...COMMON_OFFER_FIELDS, "upsellProduct", "dealType"],
  },
  free_gift: {
    label: "Free Gift",
    description: "Give away a free product with a qualifying order.",
    defaultPlacement: OfferPlacement.post_purchase,
    fields: [...COMMON_OFFER_FIELDS, "upsellProduct", "dealType"],
  },
  subscription: {
    label: "Subscription",
    description: "Offer a subscription upsell.",
    defaultPlacement: OfferPlacement.checkout,
    fields: [...COMMON_OFFER_FIELDS, "upsellProduct", "dealType"],
  },
  ai_recommend: {
    label: "AI Recommend Upsell",
    description:
      "Uses browse activity to choose which product from your pool to show. It does not create new offers by itself.",
    defaultPlacement: OfferPlacement.checkout,
    fields: [...COMMON_OFFER_FIELDS, "upsellProduct", "dealType"],
    requiresTriggerProducts: true,
    poolOnly: true,
  },
};

export function offerRequiresTriggerProducts(offerType: OfferType): boolean {
  return Boolean(OFFER_TYPE_CONFIG[offerType]?.requiresTriggerProducts);
}

/** Guard for an arbitrary value being a valid canonical offer type. */
export function isOfferType(value: unknown): value is OfferType {
  return typeof value === "string" && Object.values(OfferType).includes(value as OfferType);
}

/** Guard for an arbitrary value being a valid offer placement. */
export function isOfferPlacement(value: unknown): value is OfferPlacement {
  return (
    typeof value === "string" &&
    Object.values(OfferPlacement).includes(value as OfferPlacement)
  );
}

/** Normalize a raw value into a canonical offer type, defaulting to cross-sell. */
export function normalizeOfferType(value: unknown): OfferType {
  return isOfferType(value) ? value : OfferType.cross_sell;
}

/** Get the configuration for a canonical offer type. */
export function getOfferTypeConfig(offerType: OfferType): OfferTypeConfig {
  return OFFER_TYPE_CONFIG[offerType];
}

/** Options for the offer-type selection step of the create flow. */
export function offerTypeOptions(): Array<{
  value: OfferType;
  label: string;
  description: string;
}> {
  return Object.values(OfferType).map((value) => ({
    value,
    label: OFFER_TYPE_CONFIG[value].label,
    description: OFFER_TYPE_CONFIG[value].description,
  }));
}

// ── Deal types (the deal applied on the upsell, e.g. "Free"/"Discount") ────
//
// Stored under `triggerRules.offerType` for backward compatibility with
// existing offers. Centralized here so the offer form, validation, and any
// future renderer share one definition instead of hardcoded strings.

export const DEAL_TYPE_OPTIONS = [
  { value: "free", label: "Free" },
  { value: "discount", label: "Discount (% value)" },
  { value: "as-is", label: "As it is" },
] as const;

export type DealType = (typeof DEAL_TYPE_OPTIONS)[number]["value"];

export function isDealType(value: unknown): value is DealType {
  return DEAL_TYPE_OPTIONS.some((option) => option.value === value);
}

export function normalizeDealType(value: unknown): DealType {
  return isDealType(value) ? value : "free";
}
