import { ConsentSubjectType, ShopperIntentState } from "@prisma/client";
import db from "../../db.server";
import { inferIntent, type IntentInference } from "./heuristics";

const LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;

export function subjectFromIdentity(input: {
  customerId?: string | null;
  anonId?: string | null;
  sessionId?: string | null;
}): { subjectType: ConsentSubjectType; subjectId: string } | null {
  if (input.customerId?.trim()) {
    return { subjectType: ConsentSubjectType.customer, subjectId: input.customerId.trim() };
  }
  if (input.anonId?.trim()) {
    return { subjectType: ConsentSubjectType.anon, subjectId: input.anonId.trim() };
  }
  if (input.sessionId?.trim()) {
    return { subjectType: ConsentSubjectType.session, subjectId: input.sessionId.trim() };
  }
  return null;
}

export async function refreshShopperProfile(input: {
  shop: string;
  customerId?: string | null;
  anonId?: string | null;
  sessionId?: string | null;
}): Promise<IntentInference> {
  const subject = subjectFromIdentity(input);
  const empty = inferIntent([]);
  if (!subject) return empty;

  const since = new Date(Date.now() - LOOKBACK_MS);
  const events = await db.shopperEvent.findMany({
    where: {
      shop: input.shop,
      occurredAt: { gte: since },
      consentAnalytics: true,
      OR: [
        ...(input.customerId ? [{ customerId: input.customerId }] : []),
        ...(input.anonId ? [{ anonId: input.anonId }, { sessionId: input.anonId }] : []),
        ...(input.sessionId ? [{ sessionId: input.sessionId }, { anonId: input.sessionId }] : []),
      ],
    },
    select: { name: true, productId: true, occurredAt: true },
    orderBy: { occurredAt: "asc" },
    take: 500,
  });

  const inferred = inferIntent(events);
  const intentState = inferred.state as ShopperIntentState;
  const now = new Date();

  await db.shopperProfile.upsert({
    where: {
      shop_subjectType_subjectId: {
        shop: input.shop,
        subjectType: subject.subjectType,
        subjectId: subject.subjectId,
      },
    },
    create: {
      shop: input.shop,
      subjectType: subject.subjectType,
      subjectId: subject.subjectId,
      intentState,
      purchaseIntent: inferred.purchaseIntent,
      productInterest: inferred.productInterest,
      priceSensitivity: inferred.priceSensitivity,
      discountSensitivity: inferred.discountSensitivity,
      crossSellPotential: inferred.crossSellPotential,
      abandonRisk: inferred.abandonRisk,
      recentProductIds: inferred.recentProductIds,
      purchasedProductIds: inferred.purchasedProductIds,
      snapshotAt: now,
    },
    update: {
      intentState,
      purchaseIntent: inferred.purchaseIntent,
      productInterest: inferred.productInterest,
      priceSensitivity: inferred.priceSensitivity,
      discountSensitivity: inferred.discountSensitivity,
      crossSellPotential: inferred.crossSellPotential,
      abandonRisk: inferred.abandonRisk,
      recentProductIds: inferred.recentProductIds,
      purchasedProductIds: inferred.purchasedProductIds,
      snapshotAt: now,
    },
  });

  await db.shopperIntentSnapshot.create({
    data: {
      shop: input.shop,
      subjectType: subject.subjectType,
      subjectId: subject.subjectId,
      intentState,
      purchaseIntent: inferred.purchaseIntent,
      abandonRisk: inferred.abandonRisk,
      recordedAt: now,
    },
  });

  return inferred;
}
