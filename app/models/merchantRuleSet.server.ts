import { Prisma } from "@prisma/client";
import {
  formatProductIdList,
  normalizeMaxN,
  optionalNumber,
  parseProductIdList,
} from "../config/merchantRules";
import { MAX_UPSELL_PRODUCTS } from "./eligibleOffer";
import { DEFAULT_MAX_DISCOUNT_PERCENT, normalizeMaxDiscountPercent } from "../ai/offer/policy";
import { DEFAULT_HOLDOUT_PERCENT, normalizeHoldoutPercent } from "../ai/decide/holdout";
import {
  DEFAULT_OPTIMIZATION_GOAL,
  normalizeOptimizationGoal,
  type OptimizationGoal,
} from "../ai/learn/goal";
import { normalizeLlmProvider, type LlmProviderChoice, type ShopLlmKeys } from "../ai/llm/providers";
import { isEnterpriseShop } from "../enterprise/tier";
import db from "../db.server";
import type { MerchantRules } from "../ai/recommend/pipeline";

export {
  formatProductIdList,
  normalizeMaxN,
  optionalNumber,
  parseProductIdList,
} from "../config/merchantRules";

export interface MerchantRuleSetRecord {
  shop: string;
  neverProductIds: string[];
  alwaysProductIds: string[];
  maxN: number;
  minMarginPercent: number | null;
  maxDiscountPercent: number;
  holdoutPercent: number;
  optimizationGoal: OptimizationGoal;
  copilotProvider: LlmProviderChoice;
  copilotModel: string;
  autopilotPublish: boolean;
  priceMin: number | null;
  priceMax: number | null;
}

function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value == null) return null;
  return Number(value);
}

function toRecord(row: {
  shop: string;
  neverProductIds: string[];
  alwaysProductIds: string[];
  maxN: number;
  minMarginPercent: number | null;
  maxDiscountPercent: number;
  holdoutPercent?: number;
  optimizationGoal?: string;
  copilotProvider?: string;
  copilotModel?: string;
  autopilotPublish?: boolean;
  priceMin: Prisma.Decimal | number | null;
  priceMax: Prisma.Decimal | number | null;
}): MerchantRuleSetRecord {
  return {
    shop: row.shop,
    neverProductIds: row.neverProductIds,
    alwaysProductIds: row.alwaysProductIds,
    maxN: normalizeMaxN(row.maxN),
    minMarginPercent: row.minMarginPercent,
    maxDiscountPercent: normalizeMaxDiscountPercent(row.maxDiscountPercent),
    holdoutPercent: normalizeHoldoutPercent(row.holdoutPercent ?? DEFAULT_HOLDOUT_PERCENT),
    optimizationGoal: normalizeOptimizationGoal(row.optimizationGoal, {
      allowProfit: row.minMarginPercent != null,
    }),
    copilotProvider: normalizeLlmProvider(row.copilotProvider),
    copilotModel: typeof row.copilotModel === "string" ? row.copilotModel.trim() : "",
    autopilotPublish: Boolean(row.autopilotPublish) && isEnterpriseShop(row.shop),
    priceMin: decimalToNumber(row.priceMin),
    priceMax: decimalToNumber(row.priceMax),
  };
}

export function emptyMerchantRuleSet(shop: string): MerchantRuleSetRecord {
  return {
    shop,
    neverProductIds: [],
    alwaysProductIds: [],
    maxN: MAX_UPSELL_PRODUCTS,
    minMarginPercent: null,
    maxDiscountPercent: DEFAULT_MAX_DISCOUNT_PERCENT,
    holdoutPercent: DEFAULT_HOLDOUT_PERCENT,
    optimizationGoal: DEFAULT_OPTIMIZATION_GOAL,
    copilotProvider: "auto",
    copilotModel: "",
    autopilotPublish: false,
    priceMin: null,
    priceMax: null,
  };
}

export function toPipelineMerchantRules(row: MerchantRuleSetRecord): MerchantRules {
  return {
    excludeProductIds: row.neverProductIds,
    alwaysProductIds: row.alwaysProductIds,
    maxN: row.maxN,
    minMarginPercent: row.minMarginPercent ?? undefined,
    priceMin: row.priceMin ?? undefined,
    priceMax: row.priceMax ?? undefined,
    optimizationGoal: row.optimizationGoal,
  };
}

export async function getMerchantRuleSet(shop: string): Promise<MerchantRuleSetRecord> {
  const row = await db.merchantRuleSet.findUnique({ where: { shop } });
  if (!row) return emptyMerchantRuleSet(shop);
  return toRecord(row);
}

/** Server-only. Never send these values to the admin UI. */
export async function getMerchantLlmKeys(shop: string): Promise<ShopLlmKeys> {
  const row = await db.merchantRuleSet.findUnique({
    where: { shop },
    select: { copilotOpenaiKey: true, copilotGrokKey: true, copilotGroqKey: true, copilotGeminiKey: true },
  });
  if (!row) return {};
  return {
    openai: row.copilotOpenaiKey.trim() || undefined,
    grok: row.copilotGrokKey.trim() || undefined,
    groq: row.copilotGroqKey.trim() || undefined,
    gemini: row.copilotGeminiKey.trim() || undefined,
  };
}

function optionalSecretFromForm(form: FormData, field: string, clearField: string): string | undefined {
  if (form.get(clearField) === "true") return "";
  const value = String(form.get(field) ?? "").trim();
  return value || undefined;
}

export async function upsertMerchantRuleSet(
  shop: string,
  input: {
    neverProductIds: string[];
    alwaysProductIds: string[];
    maxN: number;
    minMarginPercent: number | null;
    maxDiscountPercent?: number;
    holdoutPercent?: number;
    optimizationGoal?: string;
    copilotProvider?: string;
    copilotModel?: string;
    copilotOpenaiKey?: string;
    copilotGrokKey?: string;
    copilotGroqKey?: string;
    copilotGeminiKey?: string;
    autopilotPublish?: boolean;
    priceMin: number | null;
    priceMax: number | null;
  },
): Promise<MerchantRuleSetRecord> {
  const data = {
    neverProductIds: input.neverProductIds,
    alwaysProductIds: input.alwaysProductIds,
    maxN: normalizeMaxN(input.maxN),
    minMarginPercent: input.minMarginPercent,
    maxDiscountPercent: normalizeMaxDiscountPercent(
      input.maxDiscountPercent ?? DEFAULT_MAX_DISCOUNT_PERCENT,
    ),
    holdoutPercent: normalizeHoldoutPercent(input.holdoutPercent ?? DEFAULT_HOLDOUT_PERCENT),
    optimizationGoal: normalizeOptimizationGoal(input.optimizationGoal, {
      allowProfit: input.minMarginPercent != null,
    }),
    copilotProvider: normalizeLlmProvider(input.copilotProvider),
    copilotModel: (input.copilotModel ?? "").trim(),
    autopilotPublish: Boolean(input.autopilotPublish) && isEnterpriseShop(shop),
    priceMin: input.priceMin,
    priceMax: input.priceMax,
    ...(input.copilotOpenaiKey !== undefined ? { copilotOpenaiKey: input.copilotOpenaiKey } : {}),
    ...(input.copilotGrokKey !== undefined ? { copilotGrokKey: input.copilotGrokKey } : {}),
    ...(input.copilotGroqKey !== undefined ? { copilotGroqKey: input.copilotGroqKey } : {}),
    ...(input.copilotGeminiKey !== undefined ? { copilotGeminiKey: input.copilotGeminiKey } : {}),
  };
  const row = await db.merchantRuleSet.upsert({
    where: { shop },
    create: { shop, ...data },
    update: data,
  });
  return toRecord(row);
}

export function merchantRuleSetFromForm(form: FormData): {
  neverProductIds: string[];
  alwaysProductIds: string[];
  maxN: number;
  minMarginPercent: number | null;
  maxDiscountPercent: number;
  holdoutPercent: number;
  optimizationGoal: OptimizationGoal;
  copilotProvider: LlmProviderChoice;
  copilotModel: string;
  copilotOpenaiKey?: string;
  copilotGrokKey?: string;
  copilotGroqKey?: string;
  copilotGeminiKey?: string;
  autopilotPublish: boolean;
  priceMin: number | null;
  priceMax: number | null;
} {
  return {
    neverProductIds: parseProductIdList(String(form.get("neverProductIds") ?? "")),
    alwaysProductIds: parseProductIdList(String(form.get("alwaysProductIds") ?? "")),
    maxN: normalizeMaxN(form.get("maxN")),
    minMarginPercent: optionalNumber(form.get("minMarginPercent")),
    maxDiscountPercent: normalizeMaxDiscountPercent(form.get("maxDiscountPercent")),
    holdoutPercent: normalizeHoldoutPercent(form.get("holdoutPercent")),
    optimizationGoal: normalizeOptimizationGoal(form.get("optimizationGoal"), {
      allowProfit: optionalNumber(form.get("minMarginPercent")) != null,
    }),
    copilotProvider: normalizeLlmProvider(form.get("copilotProvider")),
    copilotModel: String(form.get("copilotModel") ?? "").trim(),
    copilotOpenaiKey: optionalSecretFromForm(form, "openaiApiKey", "clearOpenaiKey"),
    copilotGrokKey: optionalSecretFromForm(form, "grokApiKey", "clearGrokKey"),
    copilotGroqKey: optionalSecretFromForm(form, "groqApiKey", "clearGroqKey"),
    copilotGeminiKey: optionalSecretFromForm(form, "geminiApiKey", "clearGeminiKey"),
    autopilotPublish: form.get("autopilotPublish") === "true",
    priceMin: optionalNumber(form.get("priceMin")),
    priceMax: optionalNumber(form.get("priceMax")),
  };
}
