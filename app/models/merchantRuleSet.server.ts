import { Prisma } from "@prisma/client";
import {
  formatProductIdList,
  normalizeMaxN,
  optionalNumber,
  parseProductIdList,
} from "../config/merchantRules";
import { MAX_UPSELL_PRODUCTS } from "./eligibleOffer";
import { DEFAULT_MAX_DISCOUNT_PERCENT, normalizeMaxDiscountPercent } from "../ai/offer/policy";
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
  };
}

export async function getMerchantRuleSet(shop: string): Promise<MerchantRuleSetRecord> {
  const row = await db.merchantRuleSet.findUnique({ where: { shop } });
  if (!row) return emptyMerchantRuleSet(shop);
  return toRecord(row);
}

export async function upsertMerchantRuleSet(
  shop: string,
  input: {
    neverProductIds: string[];
    alwaysProductIds: string[];
    maxN: number;
    minMarginPercent: number | null;
    maxDiscountPercent?: number;
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
    priceMin: input.priceMin,
    priceMax: input.priceMax,
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
  priceMin: number | null;
  priceMax: number | null;
} {
  return {
    neverProductIds: parseProductIdList(String(form.get("neverProductIds") ?? "")),
    alwaysProductIds: parseProductIdList(String(form.get("alwaysProductIds") ?? "")),
    maxN: normalizeMaxN(form.get("maxN")),
    minMarginPercent: optionalNumber(form.get("minMarginPercent")),
    maxDiscountPercent: normalizeMaxDiscountPercent(form.get("maxDiscountPercent")),
    priceMin: optionalNumber(form.get("priceMin")),
    priceMax: optionalNumber(form.get("priceMax")),
  };
}
