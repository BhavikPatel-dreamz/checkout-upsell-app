import { randomUUID } from "node:crypto";
import db from "../../db.server";
import { EXPERIENCE_TEMPLATES, fallbackExperience, selectExperience, type ExperienceSelection } from "../experience/select";
import { refreshShopperProfile } from "../intent/profile.server";
import { findExperienceForChannel } from "../../models/campaign.server";
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
import { shopAllowsCheckoutDecide } from "../../models/shopCapability.server";

function channelForSurface(surface: DecideSurface): DecideSurface {
  return surface;
}

function timingFor(
  input: DecideRequest,
  surface: DecideSurface,
  intent: { purchaseIntent: number },
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
  });
}

function resolveExperienceAndTiming(input: {
  request: DecideRequest;
  intentState: string;
  purchaseIntent: number;
  maxScore: number;
  productCount: number;
}): { experience: ExperienceSelection; timing: TimingDecision } {
  const probe = timingFor(input.request, input.request.surface, input, input.maxScore, input.productCount);
  let experience = selectExperience({
    requestedSurface: input.request.surface,
    intentState: input.intentState,
    timingTrigger: probe.trigger,
    exitIntent: input.request.exitIntent,
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
): Promise<{ experience: ExperienceSelection; campaignId: string | null; experienceId: string | null }> {
  const row = await findExperienceForChannel(shop, experience.channel);
  if (!row) return { experience, campaignId: null, experienceId: null };
  const variant = row.variants[0];
  const templateId = EXPERIENCE_TEMPLATES.includes(row.templateId as (typeof EXPERIENCE_TEMPLATES)[number])
    ? (row.templateId as ExperienceSelection["templateId"])
    : experience.templateId;
  return {
    experience: {
      ...experience,
      templateId,
      headline: variant?.headline || experience.headline,
      cta: variant?.cta || experience.cta,
    },
    campaignId: row.campaignId,
    experienceId: row.id,
  };
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
    offer: { type: "none", value: null },
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

  if (input.surface === "checkout" && !(await shopAllowsCheckoutDecide(input.shop))) {
    const { experience, timing } = resolveExperienceAndTiming({
      request: input,
      intentState: intent.state,
      purchaseIntent: intent.purchaseIntent,
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
      maxScore: 0,
      productCount: 0,
    });
    const persisted = await withPersistedExperience(input.shop, experience);
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
  const maxScore = products.reduce((max, row) => Math.max(max, row.score), 0);
  const { experience, timing } = resolveExperienceAndTiming({
    request: input,
    intentState: intent.state,
    purchaseIntent: intent.purchaseIntent,
    maxScore,
    productCount: products.length,
  });
  const persisted = await withPersistedExperience(input.shop, experience);
  return buildDecideResponse({
    surface: input.surface,
    holdout: false,
    products,
    recommendationId,
    intent,
    timing,
    experience: persisted.experience,
    campaignId: persisted.campaignId,
    experienceId: persisted.experienceId,
  });
}
