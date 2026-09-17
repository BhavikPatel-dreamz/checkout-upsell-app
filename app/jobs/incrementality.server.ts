import { OfferEventType } from "@prisma/client";
import db from "../db.server";
import { computeIncrementality, type CohortTotals, ALL_SURFACES, INCREMENTALITY_SURFACES, SHOP_WIDE_EXPERIMENT_ID } from "../ai/learn/incrementality";

export const INCREMENTALITY_WINDOW_DAYS = 7;

const PURCHASE_NAMES = new Set(["purchase", "checkout_completed", "recommendation_purchase"]);

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function emptyCohort(): CohortTotals {
  return { users: 0, orders: 0, revenue: 0 };
}

async function shopsWithAssignments(shopFilter?: string): Promise<string[]> {
  if (shopFilter) return [shopFilter];
  const rows = await db.experimentAssignment.findMany({
    distinct: ["shop"],
    select: { shop: true },
  });
  return rows.map((row) => row.shop);
}

async function cohortFor(
  shop: string,
  assignments: Array<{ subjectId: string; holdout: boolean }>,
  holdout: boolean,
  since: Date,
  until: Date,
): Promise<CohortTotals> {
  const subjects = [...new Set(assignments.filter((row) => row.holdout === holdout).map((row) => row.subjectId))];
  if (subjects.length === 0) return emptyCohort();

  const [purchases, offerPurchases] = await Promise.all([
    db.shopperEvent.findMany({
      where: {
        shop,
        occurredAt: { gte: since, lt: until },
        consentAnalytics: true,
        name: { in: [...PURCHASE_NAMES] },
        OR: [
          { customerId: { in: subjects } },
          { anonId: { in: subjects } },
          { sessionId: { in: subjects } },
        ],
      },
      select: { customerId: true, anonId: true, sessionId: true, eventId: true, context: true },
    }),
    db.offerEvent.findMany({
      where: {
        shop,
        createdAt: { gte: since, lt: until },
        eventType: OfferEventType.purchased,
        OR: [{ customerId: { in: subjects } }, { guestKey: { in: subjects } }],
      },
      select: { orderId: true, revenue: true, customerId: true, guestKey: true },
    }),
  ]);

  const orderIds = new Set<string>();
  let revenue = 0;
  for (const row of offerPurchases) {
    if (row.orderId) orderIds.add(row.orderId);
    else orderIds.add(`offer:${row.customerId ?? row.guestKey}`);
    revenue += row.revenue == null ? 0 : Number(row.revenue);
  }
  if (orderIds.size === 0) {
    for (const row of purchases) {
      orderIds.add(row.eventId);
      const context = row.context && typeof row.context === "object" ? (row.context as { cartValue?: unknown }) : {};
      const cartValue = Number(context.cartValue);
      if (Number.isFinite(cartValue)) revenue += cartValue;
    }
  }

  return {
    users: subjects.length,
    orders: orderIds.size,
    revenue,
  };
}

async function upsertStat(input: {
  shop: string;
  experimentId: string;
  surface: string;
  windowStart: Date;
  windowEnd: Date;
  treated: CohortTotals;
  holdout: CohortTotals;
}) {
  const stats = computeIncrementality(input.treated, input.holdout);
  await db.incrementalityStat.upsert({
    where: {
      shop_experimentId_surface_windowStart: {
        shop: input.shop,
        experimentId: input.experimentId,
        surface: input.surface,
        windowStart: input.windowStart,
      },
    },
    create: {
      shop: input.shop,
      experimentId: input.experimentId,
      surface: input.surface,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      ...stats,
    },
    update: {
      windowEnd: input.windowEnd,
      computedAt: new Date(),
      ...stats,
    },
  });
  return stats;
}

async function rebuildBanditArms(
  shop: string,
  assignments: Array<{ experimentId: string; subjectId: string; holdout: boolean; variantId: string | null }>,
  since: Date,
  until: Date,
) {
  const treated = assignments.filter((row) => !row.holdout && row.variantId);
  const byExperiment = new Map<string, typeof treated>();
  for (const row of treated) {
    const list = byExperiment.get(row.experimentId) ?? [];
    list.push(row);
    byExperiment.set(row.experimentId, list);
  }

  for (const [experimentId, group] of byExperiment) {
    const experiment = await db.experiment.findFirst({
      where: { id: experimentId, shop },
      select: { experienceId: true },
    });
    if (!experiment) continue;

    const variants = await db.experienceVariant.findMany({
      where: { shop, experienceId: experiment.experienceId },
      select: { id: true },
    });
    const byVariant = new Map<string, typeof group>();
    for (const row of group) {
      const id = row.variantId as string;
      const list = byVariant.get(id) ?? [];
      list.push(row);
      byVariant.set(id, list);
    }

    for (const variant of variants) {
      const slice = byVariant.get(variant.id) ?? [];
      const cohort =
        slice.length === 0
          ? emptyCohort()
          : await cohortFor(
              shop,
              slice.map((row) => ({ subjectId: row.subjectId, holdout: false })),
              false,
              since,
              until,
            );
      await db.experienceVariant.update({
        where: { id: variant.id },
        data: {
          banditTrials: cohort.users,
          banditSuccesses: Math.min(cohort.orders, cohort.users),
          banditRewardSum: cohort.revenue,
        },
      });
    }
  }
}

export async function rebuildIncrementalityStats(shopFilter?: string): Promise<{
  shops: number;
  rows: number;
}> {
  const windowEnd = new Date();
  const windowStart = startOfUtcDay(
    new Date(windowEnd.getTime() - INCREMENTALITY_WINDOW_DAYS * 24 * 60 * 60 * 1000),
  );
  const shops = await shopsWithAssignments(shopFilter);
  let rows = 0;

  for (const shop of shops) {
    const assignments = await db.experimentAssignment.findMany({
      where: { shop, assignedAt: { gte: windowStart, lt: windowEnd } },
      select: {
        experimentId: true,
        subjectId: true,
        holdout: true,
        surface: true,
        variantId: true,
      },
    });
    if (assignments.length === 0) continue;

    const byExperiment = new Map<string, typeof assignments>();
    for (const row of assignments) {
      const list = byExperiment.get(row.experimentId) ?? [];
      list.push(row);
      byExperiment.set(row.experimentId, list);
    }

    const shopWideSeen = new Set<string>();
    const shopWide: typeof assignments = [];
    for (const row of assignments) {
      if (shopWideSeen.has(row.subjectId)) continue;
      shopWideSeen.add(row.subjectId);
      shopWide.push(row);
    }

    const treated = await cohortFor(shop, shopWide, false, windowStart, windowEnd);
    const holdout = await cohortFor(shop, shopWide, true, windowStart, windowEnd);
    await upsertStat({
      shop,
      experimentId: SHOP_WIDE_EXPERIMENT_ID,
      surface: ALL_SURFACES,
      windowStart,
      windowEnd,
      treated,
      holdout,
    });
    rows += 1;

    for (const surface of INCREMENTALITY_SURFACES) {
      const slice = shopWide.filter((row) => (row.surface || ALL_SURFACES) === surface);
      if (slice.length === 0) continue;
      const t = await cohortFor(shop, slice, false, windowStart, windowEnd);
      const h = await cohortFor(shop, slice, true, windowStart, windowEnd);
      await upsertStat({
        shop,
        experimentId: SHOP_WIDE_EXPERIMENT_ID,
        surface,
        windowStart,
        windowEnd,
        treated: t,
        holdout: h,
      });
      rows += 1;
    }

    for (const [experimentId, group] of byExperiment) {
      const t = await cohortFor(shop, group, false, windowStart, windowEnd);
      const h = await cohortFor(shop, group, true, windowStart, windowEnd);
      await upsertStat({
        shop,
        experimentId,
        surface: ALL_SURFACES,
        windowStart,
        windowEnd,
        treated: t,
        holdout: h,
      });
      rows += 1;
    }

    await rebuildBanditArms(shop, assignments, windowStart, windowEnd);
  }

  return { shops: shops.length, rows };
}
