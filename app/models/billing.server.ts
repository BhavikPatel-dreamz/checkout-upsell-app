import db from "../db.server";
import {
  APP_PLANS,
  planAllows,
  planById,
  type PlanFeature,
  type PlanId,
} from "../config/billingPlan";

export function listSubscriptionHistory(shop: string) {
  return db.subscriptionHistory.findMany({
    where: { shop },
    orderBy: { chargedAt: "desc" },
  });
}

export async function ensureStoreBillingOffer(shop: string) {
  const existing = await db.storeBillingOffer.findUnique({ where: { shop } });
  if (existing) return existing;

  const approved = await db.subscriptionHistory.findFirst({
    where: { shop, approved: true, active: true },
    select: { id: true },
  });
  const legacySubscriber = Boolean(approved);

  return db.storeBillingOffer.create({
    data: {
      shop,
      plan: legacySubscriber ? "silver" : "free",
      discountPercent: 0,
      trialDays: legacySubscriber ? 0 : APP_PLANS.silver.trialDays,
      legacySubscriber,
    },
  });
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

async function recordPlanChange(shop: string, plan: PlanId) {
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
      chargeId: null,
      name: selected.name,
      price: selected.amount.toFixed(2),
      approved: true,
      active,
      chargedAt: new Date(),
    },
  });
}

export async function setStorePlan(shop: string, plan: PlanId) {
  const current = await ensureStoreBillingOffer(shop);
  const selected = planById(plan);
  if (!selected.available || current.plan === plan) {
    return current;
  }
  const updated = await db.storeBillingOffer.update({
    where: { shop },
    data: {
      plan,
      trialDays: current.legacySubscriber ? 0 : selected.trialDays,
      cancelledAt: plan === "free" ? new Date() : null,
    },
  });
  await recordPlanChange(shop, plan);
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
  await recordPlanChange(shop, plan.id);
  return listSubscriptionHistory(shop);
}
