import { randomUUID } from "node:crypto";
import db from "../../db.server";
import { refreshShopperProfile } from "../intent/profile.server";
import { runHybridRecommend } from "../recommend/hybridRecommend.server";
import { evaluateTiming, type TimingDecision } from "../timing/timing";
import {
  identityKey,
  type DecideProduct,
  type DecideRequest,
  type DecideResponse,
  type DecideSurface,
} from "./contract";
import { assignHoldout } from "./holdout";

function channelForSurface(surface: DecideSurface): DecideSurface {
  return surface;
}

async function productsFromHybrid(input: DecideRequest & { shop: string }): Promise<DecideProduct[]> {
  const anchors = [...new Set([...(input.productIds ?? []), ...(input.cartProductIds ?? [])])];
  if (anchors.length === 0) return [];

  const hybrid = await runHybridRecommend({
    shop: input.shop,
    productIds: anchors,
    cartProductIds: input.cartProductIds ?? [],
    customerId: input.customerId ?? null,
  });

  const products: DecideProduct[] = [];
  for (const row of hybrid.ranked) {
    const variant = await db.productVariant.findFirst({
      where: { shop: input.shop, productId: row.productId, availableForSale: true },
      select: { variantId: true },
      orderBy: { inventoryQuantity: "desc" },
    });
    products.push({
      productId: row.productId,
      variantId: variant?.variantId ?? null,
      strategy: row.strategy,
      score: row.score.total,
    });
  }
  return products;
}

const PASSTHROUGH_TIMING: TimingDecision = {
  show: true,
  delayMs: 0,
  trigger: "immediate",
  expectedValue: 1,
  interruptionCost: 0,
  reason: "passthrough",
};

export function buildDecideResponse(input: {
  surface: DecideSurface;
  holdout: boolean;
  products?: DecideProduct[];
  recommendationId?: string;
  intent?: { state: string; purchaseIntent: number };
  timing?: TimingDecision;
}): DecideResponse {
  const holdout = input.holdout;
  const products = holdout ? [] : (input.products ?? []);
  const timing = input.timing ?? PASSTHROUGH_TIMING;
  const show = !holdout && products.length > 0 && timing.show;
  return {
    show,
    experience: { channel: channelForSurface(input.surface), templateId: "default" },
    products,
    offer: { type: "none", value: null },
    copy: { headline: "", cta: "" },
    recommendationId: input.recommendationId ?? randomUUID(),
    intent: input.intent ?? { state: "EXPLORING", purchaseIntent: 0 },
    holdout,
    timing: {
      delayMs: timing.delayMs,
      trigger: timing.trigger,
      expectedValue: timing.expectedValue,
      interruptionCost: timing.interruptionCost,
      reason: timing.reason,
    },
  };
}

export async function decideForRequest(input: DecideRequest & { shop: string }): Promise<DecideResponse> {
  const recommendationId = randomUUID();
  const holdout = assignHoldout(input.shop, identityKey(input));
  const consented = input.consented !== false;
  const inferred = consented
    ? await refreshShopperProfile({
        shop: input.shop,
        customerId: input.customerId,
        anonId: input.anonId,
        sessionId: input.sessionId,
      })
    : { state: "EXPLORING" as const, purchaseIntent: 0 };
  const intent = { state: inferred.state, purchaseIntent: inferred.purchaseIntent };

  if (holdout || !consented) {
    return buildDecideResponse({
      surface: input.surface,
      holdout,
      products: [],
      recommendationId,
      intent,
      timing: evaluateTiming({
        surface: input.surface,
        dwellMs: input.dwellMs,
        scrollDepth: input.scrollDepth,
        exitIntent: input.exitIntent,
        cartValue: input.cartValue,
        purchaseIntent: intent.purchaseIntent,
        maxScore: 0,
        productCount: 0,
      }),
    });
  }

  const products = await productsFromHybrid(input);
  const maxScore = products.reduce((max, row) => Math.max(max, row.score), 0);
  const timing = evaluateTiming({
    surface: input.surface,
    dwellMs: input.dwellMs,
    scrollDepth: input.scrollDepth,
    exitIntent: input.exitIntent,
    cartValue: input.cartValue,
    purchaseIntent: intent.purchaseIntent,
    maxScore,
    productCount: products.length,
  });
  return buildDecideResponse({
    surface: input.surface,
    holdout: false,
    products,
    recommendationId,
    intent,
    timing,
  });
}
