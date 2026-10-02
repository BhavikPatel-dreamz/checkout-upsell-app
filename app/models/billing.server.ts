import db from "../db.server";
import {
  APP_PLANS,
  planAllows,
  planById,
  planIdFromShopifyHandle,
  type PlanFeature,
  type PlanId,
} from "../config/billingPlan";

type AdminGraphql = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

const APP_SUBSCRIPTIONS_QUERY = `#graphql
  query AppPricingSubscriptions {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
      }
    }
  }
`;

export function listSubscriptionHistory(shop: string) {
  return db.subscriptionHistory.findMany({
    where: { shop },
    orderBy: { chargedAt: "desc" },
  });
}

/** Paid access ends on uninstall. Shopify must approve a new charge after reinstall. */
export async function revokePaidEntitlement(shop: string) {
  await db.subscriptionHistory.updateMany({
    where: { shop, active: true },
    data: { active: false },
  });

  const existing = await db.storeBillingOffer.findUnique({ where: { shop } });
  if (!existing) return null;

  return db.storeBillingOffer.update({
    where: { shop },
    data: {
      plan: "free",
      legacySubscriber: false,
      shopifyChargeId: null,
      cancelledAt: new Date(),
      trialDays: APP_PLANS.silver.trialDays,
    },
  });
}

export async function ensureStoreBillingOffer(shop: string) {
  const existing = await db.storeBillingOffer.findUnique({ where: { shop } });
  if (existing) return existing;

  return db.storeBillingOffer.create({
    data: {
      shop,
      plan: "free",
      discountPercent: 0,
      trialDays: APP_PLANS.silver.trialDays,
      legacySubscriber: false,
    },
  });
}

function planFromShopifySubscriptions(
  subscriptions: Array<{ id?: string | null; name?: string | null; status?: string | null }>,
): { plan: PlanId; chargeId: string | null } {
  const active = subscriptions.filter((row) => {
    const status = (row.status ?? "ACTIVE").toUpperCase();
    return status === "ACTIVE" || status === "ACCEPTED";
  });

  let plan: PlanId = "free";
  let chargeId: string | null = null;
  for (const row of active) {
    const mapped = planIdFromShopifyHandle(row.name ?? null);
    if (!mapped || mapped === "free") continue;
    if (!planById(mapped).available && mapped !== "silver") continue;
    if (mapped === "gold" || (mapped === "silver" && plan === "free")) {
      plan = mapped;
      chargeId = row.id ?? null;
    }
  }
  return { plan, chargeId };
}

/** Entitlement follows Shopify App Pricing, not leftover local rows. */
export async function syncBillingFromShopify(shop: string, admin: AdminGraphql) {
  await ensureStoreBillingOffer(shop);

  try {
    const response = await admin.graphql(APP_SUBSCRIPTIONS_QUERY);
    if (response.status === 302 || response.status === 401) return ensureStoreBillingOffer(shop);

    const body = (await response.json()) as {
      data?: {
        currentAppInstallation?: {
          activeSubscriptions?: Array<{
            id?: string | null;
            name?: string | null;
            status?: string | null;
          }>;
        };
      };
      errors?: unknown;
    };

    if (body.errors) {
      return ensureStoreBillingOffer(shop);
    }

    const { plan, chargeId } = planFromShopifySubscriptions(
      body.data?.currentAppInstallation?.activeSubscriptions ?? [],
    );
    return setStorePlan(shop, plan, chargeId);
  } catch {
    return ensureStoreBillingOffer(shop);
  }
}

export async function storeCanUse(shop: string, feature: PlanFeature) {
  const offer = await ensureStoreBillingOffer(shop);
  return planAllows(offer.plan, feature);
}

export async function storeOfferUsage(shop: string) {
  const offer = await ensureStoreBillingOffer(shop);
  const plan = planById(offer.plan);
  const count = await db.offer.count({ where: { shop } });
  const limit = plan.offerLimit;
  return {
    plan,
    count,
    limit,
    canCreate: limit == null || count < limit,
  };
}

async function nextSubscriptionHistoryId() {
  const latest = await db.subscriptionHistory.aggregate({ _max: { id: true } });
  return (latest._max.id ?? 0) + 1;
}

async function recordPlanChange(shop: string, plan: PlanId, chargeId?: string | null) {
  const selected = planById(plan);
  const active = plan !== "free";
  await db.subscriptionHistory.updateMany({
    where: { shop, active: true },
    data: { active: false },
  });
  await db.subscriptionHistory.create({
    data: {
      id: await nextSubscriptionHistoryId(),
      shop,
      chargeId: chargeId || null,
      name: selected.name,
      price: selected.amount.toFixed(2),
      approved: true,
      active,
      chargedAt: new Date(),
    },
  });
}

export async function setStorePlan(shop: string, plan: PlanId, chargeId?: string | null) {
  const current = await ensureStoreBillingOffer(shop);
  const selected = planById(plan);
  if (!selected.available && plan !== "free") return current;

  const samePlan = current.plan === plan;
  const nextChargeId = plan === "free" ? null : chargeId || current.shopifyChargeId;
  const sameCharge = (current.shopifyChargeId || null) === (nextChargeId || null);

  const updated =
    samePlan && sameCharge
      ? current
      : await db.storeBillingOffer.update({
          where: { shop },
          data: {
            plan,
            shopifyChargeId: nextChargeId,
            trialDays: plan === "free" ? APP_PLANS.silver.trialDays : selected.trialDays,
            cancelledAt: plan === "free" ? new Date() : null,
            legacySubscriber: false,
          },
        });

  if (samePlan && !chargeId) return updated;

  const active = plan !== "free";
  if (chargeId) {
    const existing = await db.subscriptionHistory.findFirst({ where: { shop, chargeId } });
    if (existing) {
      await db.subscriptionHistory.updateMany({
        where: { shop, active: true, NOT: { id: existing.id } },
        data: { active: false },
      });
      await db.subscriptionHistory.update({
        where: { id: existing.id },
        data: {
          name: selected.name,
          price: selected.amount.toFixed(2),
          approved: true,
          active,
          chargedAt: new Date(),
        },
      });
      return updated;
    }
  } else if (samePlan) {
    return updated;
  }

  await recordPlanChange(shop, plan, chargeId);
  return updated;
}

/** Writes the current plan into history when an upgrade was saved before history rows existed. */
export async function ensureCurrentPlanHistory(shop: string) {
  const offer = await ensureStoreBillingOffer(shop);
  const plan = planById(offer.plan);
  if (plan.id === "free" && !offer.cancelledAt) return null;
  const latest = await db.subscriptionHistory.findFirst({
    where: { shop },
    orderBy: { chargedAt: "desc" },
  });
  const price = plan.amount.toFixed(2);
  const active = plan.id !== "free";
  if (latest && latest.name === plan.name && latest.price === price && latest.active === active) {
    return latest;
  }
  await recordPlanChange(shop, plan.id, offer.shopifyChargeId);
  return listSubscriptionHistory(shop);
}
