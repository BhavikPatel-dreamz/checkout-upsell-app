export const PLAN_IDS = ["free", "silver", "gold"] as const;

export type PlanId = (typeof PLAN_IDS)[number];

export type PlanFeature =
  | "checkout_upsell"
  | "post_purchase"
  | "analytics"
  | "ai_recommend";

export const PLAN_FEATURE_LABELS: Record<PlanFeature, string> = {
  checkout_upsell: "Checkout upsells",
  post_purchase: "Post-purchase upsells",
  analytics: "Analytics",
  ai_recommend: "AI recommendations",
};

export const PLAN_FEATURE_ORDER: PlanFeature[] = [
  "checkout_upsell",
  "post_purchase",
  "analytics",
  "ai_recommend",
];

export interface AppPlan {
  id: PlanId;
  name: string;
  amount: number;
  currency: "USD";
  trialDays: number;
  offerLimit: number | null;
  features: PlanFeature[];
  summary: string;
  /** Shown on the subscription page. Gold stays off until it is for sale. */
  available: boolean;
}

export const APP_PLANS: Record<PlanId, AppPlan> = {
  free: {
    id: "free",
    name: "Free",
    amount: 0,
    currency: "USD",
    trialDays: 0,
    offerLimit: 2,
    features: ["checkout_upsell"],
    summary: "Two checkout offers. Analytics is not included.",
    available: true,
  },
  silver: {
    id: "silver",
    name: "Silver",
    amount: 9.99,
    currency: "USD",
    trialDays: 15,
    offerLimit: 10,
    features: ["checkout_upsell", "post_purchase", "analytics"],
    summary: "Up to 10 offers, plus analytics.",
    available: true,
  },
  gold: {
    id: "gold",
    name: "Gold",
    amount: 24.99,
    currency: "USD",
    trialDays: 15,
    offerLimit: null,
    features: ["checkout_upsell", "post_purchase", "analytics", "ai_recommend"],
    summary: "Unlimited upsells, analytics, and AI recommendations.",
    available: false,
  },
};

export function listedPlans(): AppPlan[] {
  return PLAN_IDS.map((id) => APP_PLANS[id]).filter((plan) => plan.available);
}

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);
}

export function planById(plan: string | null | undefined): AppPlan {
  return isPlanId(plan) ? APP_PLANS[plan] : APP_PLANS.free;
}

export function planAllows(plan: string | null | undefined, feature: PlanFeature): boolean {
  return planById(plan).features.includes(feature);
}

export function discountedAmount(amount: number, discountPercent: number): number {
  const percent = Math.min(100, Math.max(0, discountPercent));
  return Math.round(amount * (100 - percent)) / 100;
}

/** Partner Dashboard plan handle, or our plan id, after Shopify appends plan_handle. */
export function planIdFromShopifyHandle(handle: string | null): PlanId | null {
  if (!handle) return null;
  const value = handle.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!value) return null;
  if (value.includes("gold")) return "gold";
  if (value === "free" || value.includes("free")) return "free";
  if (value === "silver" || value.includes("silver")) return "silver";
  return null;
}

export function planSelectionUrl(shop: string, appHandle: string): string {
  const storeHandle = shop.replace(/\.myshopify\.com$/i, "");
  return `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`;
}

/** Shopify admin page where the merchant can cancel the app charge. */
export function subscriptionManageUrl(shop: string): string {
  const storeHandle = shop.replace(/\.myshopify\.com$/i, "");
  return `https://admin.shopify.com/store/${storeHandle}/settings/apps`;
}
