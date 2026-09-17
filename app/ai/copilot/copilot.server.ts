import db from "../../db.server";
import { getMerchantRuleSet } from "../../models/merchantRuleSet.server";
import { completeChat } from "../llm/complete.server";
import { anyLlmConfigured } from "../llm/providers";
import {
  answerFromAggregates,
  formatAggregatesForPrompt,
  stripForbiddenKeys,
  type CopilotAggregates,
  type CopilotIncrementalityRow,
} from "./aggregates";

export function copilotLlmEnabled(): boolean {
  const flag = process.env.AI_COPILOT_LLM?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  return anyLlmConfigured();
}

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function loadCopilotAggregates(shop: string): Promise<CopilotAggregates> {
  const [merchant, incrementality, moments, offers, campaigns] = await Promise.all([
    getMerchantRuleSet(shop),
    db.incrementalityStat.findMany({
      where: { shop },
      orderBy: [{ computedAt: "desc" }],
      take: 24,
      select: {
        experimentId: true,
        surface: true,
        treatedUsers: true,
        holdoutUsers: true,
        treatedOrders: true,
        holdoutOrders: true,
        treatedRevenue: true,
        holdoutRevenue: true,
        treatedConversion: true,
        holdoutConversion: true,
        treatedAov: true,
        holdoutAov: true,
        incrementalRevenue: true,
      },
    }),
    db.smartMoment.findMany({
      where: { shop, status: { in: ["detected", "activated"] } },
      orderBy: { expectedImpact: "desc" },
      take: 15,
      select: {
        kind: true,
        status: true,
        support: true,
        lift: true,
        expectedImpact: true,
        productId: true,
        relatedProductId: true,
      },
    }),
    db.offer.groupBy({
      by: ["isActive"],
      where: { shop },
      _count: { _all: true },
    }),
    db.campaign.groupBy({
      by: ["status"],
      where: { shop },
      _count: { _all: true },
    }),
  ]);

  const offerCounts = { total: 0, active: 0, draft: 0 };
  for (const row of offers) {
    offerCounts.total += row._count._all;
    if (row.isActive) offerCounts.active += row._count._all;
    else offerCounts.draft += row._count._all;
  }

  const campaignCounts = { total: 0, draft: 0, active: 0 };
  for (const row of campaigns) {
    campaignCounts.total += row._count._all;
    if (row.status === "active") campaignCounts.active += row._count._all;
    else campaignCounts.draft += row._count._all;
  }

  const incrementalityRows: CopilotIncrementalityRow[] = incrementality.map((row) => ({
    experimentId: row.experimentId,
    surface: row.surface,
    treatedUsers: row.treatedUsers,
    holdoutUsers: row.holdoutUsers,
    treatedOrders: row.treatedOrders,
    holdoutOrders: row.holdoutOrders,
    treatedRevenue: num(row.treatedRevenue),
    holdoutRevenue: num(row.holdoutRevenue),
    treatedConversion: row.treatedConversion,
    holdoutConversion: row.holdoutConversion,
    treatedAov: row.treatedAov,
    holdoutAov: row.holdoutAov,
    incrementalRevenue: num(row.incrementalRevenue),
  }));

  return stripForbiddenKeys({
    shop,
    optimizationGoal: merchant.optimizationGoal,
    holdoutPercent: merchant.holdoutPercent,
    maxDiscountPercent: merchant.maxDiscountPercent,
    offers: offerCounts,
    campaigns: campaignCounts,
    incrementality: incrementalityRows,
    moments,
  });
}

async function completeFromLlm(
  question: string,
  aggregates: CopilotAggregates,
  provider: unknown,
  model?: string,
): Promise<{ text: string; provider: "openai" | "grok" | "gemini" } | null> {
  if (!copilotLlmEnabled()) return null;
  return completeChat({
    provider,
    model,
    timeoutMs: 8000,
    temperature: 0.2,
    system:
      "You are a Shopify admin copilot for checkout upsell incrementality. Answer only from the JSON aggregates. Never ask for or invent customer emails, phones, session ids, or raw event logs. If a number is missing, say so. Do not tell the merchant to auto-publish; Standard requires review. Keep answers under 180 words.",
    user: `Question: ${question.slice(0, 500)}\nAggregates JSON:\n${formatAggregatesForPrompt(aggregates)}`,
  });
}

export async function queryCopilot(shop: string, question: string): Promise<{
  answer: string;
  source: "openai" | "grok" | "gemini" | "aggregates";
}> {
  const trimmed = question.trim();
  if (!trimmed) {
    return { answer: "Ask a question about incrementality, Smart Moments, or draft campaigns.", source: "aggregates" };
  }
  const [aggregates, merchant] = await Promise.all([
    loadCopilotAggregates(shop),
    getMerchantRuleSet(shop),
  ]);
  const llm = await completeFromLlm(
    trimmed,
    aggregates,
    merchant.copilotProvider,
    merchant.copilotModel,
  );
  if (llm) return { answer: llm.text, source: llm.provider };
  return { answer: answerFromAggregates(trimmed, aggregates), source: "aggregates" };
}
