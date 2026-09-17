import { randomUUID } from "node:crypto";
import { OfferPlacement } from "@prisma/client";
import db from "../../db.server";
import { EXPERIENCE_TEMPLATES, fallbackExperience, selectExperience, type ExperienceSelection } from "../experience/select";
import { refreshShopperProfile } from "../intent/profile.server";
import { gateAndRecordInterruption } from "../experience/budget.server";
import { runHybridRecommend } from "../recommend/hybridRecommend.server";
import { evaluateTiming, type TimingDecision } from "../timing/timing";
import {
  identityKey,
  type DecideProduct,
  type DecideRequest,
  type DecideResponse,
  type DecideSurface,
} from "./contract";
import { assignHoldout, holdoutRateFromPercent } from "./holdout";
import { shopAllowsCheckoutDecide } from "../../models/shopCapability.server";
import { findExperienceForChannel } from "../../models/campaign.server";
import { findEligibleCrossSellOffers } from "../../models/offerEligibility.server";
import { assignExperienceVariant } from "../../models/experiment.server";
import { getMerchantRuleSet } from "../../models/merchantRuleSet.server";
import { selectOfferPolicy, type OfferPolicy } from "../offer/policy";
import { inferAbandonReason } from "../offer/recoveryReason";
import { incrementalitySurfaceFor } from "../learn/incrementality";
import type { OptimizationGoal } from "../learn/goal";

function channelForSurface(surface: DecideSurface): DecideSurface {
  return surface;
}

function timingFor(
  input: DecideRequest,
  surface: DecideSurface,
  intent: { purchaseIntent: number; abandonRisk?: number },
  maxScore: number,
  productCount: number,
): TimingDecision {
  return evaluateTiming({
    surface,
    dwellMs: input.dwellMs,
    scrollDepth: input.scrollDepth,
    exitIntent: input.exitIntent,
    cartValue: input.cartValue,
    purchaseIntent: intent.purchaseIntent,
    maxScore,
    productCount,
    abandonRisk: intent.abandonRisk ?? 0,
  });
}

function resolveExperienceAndTiming(input: {
  request: DecideRequest;
  intentState: string;
  purchaseIntent: number;
  abandonRisk?: number;
  abandonReason?: ReturnType<typeof inferAbandonReason>;
  maxScore: number;
  productCount: number;
  strategies?: string[];
  priceSensitivity?: number;
  discountSensitivity?: number;
}): { experience: ExperienceSelection; timing: TimingDecision } {
  const probe = timingFor(input.request, input.request.surface, input, input.maxScore, input.productCount);
  let experience = selectExperience({
    requestedSurface: input.request.surface,
    intentState: input.intentState,
    timingTrigger: probe.trigger,
    exitIntent: input.request.exitIntent,
    abandonRisk: input.abandonRisk ?? 0,
    abandonReason: input.abandonReason,
    strategies: input.strategies,
    cartValue: input.request.cartValue,
    priceSensitivity: input.priceSensitivity,
    discountSensitivity: input.discountSensitivity,
  });
  let timing = timingFor(input.request, experience.channel, input, input.maxScore, input.productCount);
  if (!timing.show) {
    const fallback = fallbackExperience(experience);
    if (fallback) {
      const retry = timingFor(input.request, fallback.channel, input, input.maxScore, input.productCount);
      if (retry.show) {
        experience = fallback;
        timing = retry;
      }
    }
  }
  return { experience, timing };
}

async function withPersistedExperience(
  shop: string,
  experience: ExperienceSelection,
  identity: {
    holdout: boolean;
    customerId?: string | null;
    anonId?: string | null;
    sessionId?: string | null;
    optimizationGoal?: OptimizationGoal;
  },
): Promise<{ experience: ExperienceSelection; campaignId: string | null; experienceId: string | null }> {
  const row = await findExperienceForChannel(shop, experience.channel);
  if (!row) return { experience, campaignId: null, experienceId: null };
  const assigned = await assignExperienceVariant({
    shop,
    experienceId: row.id,
    campaignId: row.campaignId,
    holdout: identity.holdout,
    customerId: identity.customerId,
    anonId: identity.anonId,
    sessionId: identity.sessionId,
    optimizationGoal: identity.optimizationGoal,
    surface: incrementalitySurfaceFor({
      channel: experience.channel,
      templateId: experience.templateId,
      reason: experience.reason,
    }),
  });
  const templateId = EXPERIENCE_TEMPLATES.includes(row.templateId as (typeof EXPERIENCE_TEMPLATES)[number])
    ? (row.templateId as ExperienceSelection["templateId"])
    : experience.templateId;
  return {
    experience: {
      ...experience,
      templateId,
      headline: assigned.headline || experience.headline,
      cta: assigned.cta || experience.cta,
    },
    campaignId: row.campaignId,
    experienceId: row.id,
  };
}

function placementsForSurface(surface: DecideSurface): OfferPlacement[] {
  if (surface === "cart") return [OfferPlacement.checkout, OfferPlacement.cart_drawer];
  if (surface === "popup") return [OfferPlacement.popup];
  if (surface === "sidebar") return [OfferPlacement.sidebar];
  if (surface === "thank_you") return [OfferPlacement.post_purchase];
  if (surface === "checkout") return [OfferPlacement.checkout];
  return [OfferPlacement.product_page];
}

async function productsFromEligibleOffers(input: DecideRequest & { shop: string }): Promise<DecideProduct[]> {
  const seen = new Set<string>();
  const products: DecideProduct[] = [];
  for (const placement of placementsForSurface(input.surface)) {
    const offers = await findEligibleCrossSellOffers({
      shop: input.shop,
      placement,
      productIds: input.productIds ?? [],
      variantIds: input.variantIds ?? [],
      identity: {
        customerId: input.customerId,
        guestKey: input.sessionId,
        clientId: input.anonId,
      },
    });
    for (const row of offers) {
      if (!row.productId || !row.variantId || seen.has(row.productId)) continue;
      seen.add(row.productId);
      products.push({
        productId: row.productId,
        variantId: row.variantId,
        strategy: "similar",
        score: 0.5,
        offerId: row.offerId,
      });
    }
  }
  return products;
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
  experience?: ExperienceSelection;
  campaignId?: string | null;
  experienceId?: string | null;
  offer?: OfferPolicy;
}): DecideResponse {
  const holdout = input.holdout;
  const products = holdout ? [] : (input.products ?? []);
  const timing = input.timing ?? PASSTHROUGH_TIMING;
  const experience =
    input.experience ??
    ({
      channel: channelForSurface(input.surface),
      templateId: "default",
      headline: "",
      cta: "",
      reason: "passthrough",
    } satisfies ExperienceSelection);
  const show = !holdout && products.length > 0 && timing.show;
  return {
    show,
    experience: { channel: experience.channel, templateId: experience.templateId },
    products,
    offer: input.offer ?? { type: "none", value: null },
    copy: { headline: experience.headline, cta: experience.cta },
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
    campaignId: input.campaignId ?? null,
    experienceId: input.experienceId ?? null,
  };
}

export async function decideForRequest(input: DecideRequest & { shop: string }): Promise<DecideResponse> {
  const recommendationId = randomUUID();
  const merchant = await getMerchantRuleSet(input.shop);
  const holdout = assignHoldout(
    input.shop,
    identityKey(input),
    holdoutRateFromPercent(merchant.holdoutPercent),
  );
  const consented = input.consented !== false;
  const inferred = consented
    ? await refreshShopperProfile({
        shop: input.shop,
        customerId: input.customerId,
        anonId: input.anonId,
        sessionId: input.sessionId,
      })
    : {
        state: "EXPLORING" as const,
        purchaseIntent: 0,
        abandonRisk: 0,
        priceSensitivity: 0,
        discountSensitivity: 0,
      };
  const abandonRisk = inferred.abandonRisk ?? 0;
  const intent = { state: inferred.state, purchaseIntent: inferred.purchaseIntent };

  if (input.surface === "checkout" && !(await shopAllowsCheckoutDecide(input.shop))) {
    const { experience, timing } = resolveExperienceAndTiming({
      request: input,
      intentState: intent.state,
      purchaseIntent: intent.purchaseIntent,
      abandonRisk,
      maxScore: 0,
      productCount: 0,
    });
    return buildDecideResponse({
      surface: input.surface,
      holdout,
      products: [],
      recommendationId,
      intent,
      timing: { ...timing, show: false, reason: "checkout_not_plus", trigger: "suppressed" },
      experience,
    });
  }

  if (holdout || !consented) {
    const { experience, timing } = resolveExperienceAndTiming({
      request: input,
      intentState: intent.state,
      purchaseIntent: intent.purchaseIntent,
      abandonRisk,
      maxScore: 0,
      productCount: 0,
    });
    const persisted = await withPersistedExperience(input.shop, experience, {
      holdout,
      customerId: input.customerId,
      anonId: input.anonId,
      sessionId: input.sessionId,
      optimizationGoal: merchant.optimizationGoal,
    });
    return buildDecideResponse({
      surface: input.surface,
      holdout,
      products: [],
      recommendationId,
      intent,
      timing,
      experience: persisted.experience,
      campaignId: persisted.campaignId,
      experienceId: persisted.experienceId,
    });
  }

  const products = await productsFromHybrid(input);
  const resolvedProducts = products.length ? products : await productsFromEligibleOffers(input);
  const maxScore = resolvedProducts.reduce((max, row) => Math.max(max, row.score), 0);
  const strategies = resolvedProducts.map((row) => row.strategy);
  const abandonReason = inferAbandonReason({
    priceSensitivity: inferred.priceSensitivity ?? 0,
    discountSensitivity: inferred.discountSensitivity ?? 0,
    strategies,
    cartValue: input.cartValue ?? 0,
  });
  const resolved = resolveExperienceAndTiming({
    request: input,
    intentState: intent.state,
    purchaseIntent: intent.purchaseIntent,
    abandonRisk,
    abandonReason,
    maxScore,
    productCount: resolvedProducts.length,
    strategies,
    priceSensitivity: inferred.priceSensitivity ?? 0,
    discountSensitivity: inferred.discountSensitivity ?? 0,
  });
  const experience = resolved.experience;
  let timing = resolved.timing;
  const persisted = await withPersistedExperience(input.shop, experience, {
    holdout: false,
    customerId: input.customerId,
    anonId: input.anonId,
    sessionId: input.sessionId,
    optimizationGoal: merchant.optimizationGoal,
  });
  const wouldShow = resolvedProducts.length > 0 && timing.show;
  const frequency = await gateAndRecordInterruption({
    shop: input.shop,
    customerId: input.customerId,
    anonId: input.anonId,
    sessionId: input.sessionId,
    channel: persisted.experience.channel,
    wouldShow,
  });
  if (!frequency.allow) {
    timing = { ...timing, show: false, trigger: "suppressed", reason: frequency.reason };
  }
  const show = resolvedProducts.length > 0 && timing.show;
  const offer = selectOfferPolicy({
    show,
    intentState: intent.state,
    purchaseIntent: intent.purchaseIntent,
    strategies,
    cartValue: input.cartValue ?? 0,
    maxDiscountPercent: merchant.maxDiscountPercent,
    recoveryReason: abandonReason,
    priceSensitivity: inferred.priceSensitivity ?? 0,
    discountSensitivity: inferred.discountSensitivity ?? 0,
  });
  return buildDecideResponse({
    surface: input.surface,
    holdout: false,
    products: resolvedProducts,
    recommendationId,
    intent,
    timing,
    experience: persisted.experience,
    campaignId: persisted.campaignId,
    experienceId: persisted.experienceId,
    offer,
  });
}
