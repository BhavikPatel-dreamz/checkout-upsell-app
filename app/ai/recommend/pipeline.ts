import { MAX_UPSELL_PRODUCTS } from "../../models/eligibleOffer";
import {
  compareCandidateScores,
  scoreCandidate,
  type CandidateScore,
} from "../scoring/scoreCandidate";

export type RecommendStrategy = "fbt" | "similar" | "complementary";

export type DropReason =
  | "anchor"
  | "in_cart"
  | "out_of_stock"
  | "excluded"
  | "not_included"
  | "max_n";

/** In-memory merchant constraints. Persist + admin UI is AI-2.6. */
export interface MerchantRules {
  includeProductIds?: string[];
  excludeProductIds?: string[];
  maxN?: number;
}

export interface HybridCandidate {
  productId: string;
  strategy: RecommendStrategy;
  relationScore: number;
  availableForSale: boolean;
  inventoryQuantity: number | null;
  affinity?: number;
  interest?: number;
  complementarity?: number;
  historicalConversion?: number;
  priceFit?: number;
  businessValue?: number;
  repetition?: number;
}

export interface ScoredHybridCandidate extends HybridCandidate {
  score: CandidateScore;
}

export interface DroppedCandidate {
  productId: string;
  reason: DropReason;
}

export interface HybridPipelineInput {
  candidates: HybridCandidate[];
  anchorProductIds?: string[];
  cartProductIds?: string[];
  merchant?: MerchantRules;
}

export interface HybridPipelineResult {
  ranked: ScoredHybridCandidate[];
  dropped: DroppedCandidate[];
}

function idSet(ids: string[] | undefined): Set<string> {
  return new Set((ids ?? []).map((id) => id.trim()).filter(Boolean));
}

export function applyBusinessRules(
  candidates: HybridCandidate[],
  input: Pick<HybridPipelineInput, "anchorProductIds" | "cartProductIds">,
): { kept: HybridCandidate[]; dropped: DroppedCandidate[] } {
  const anchors = idSet(input.anchorProductIds);
  const cart = idSet(input.cartProductIds);
  const kept: HybridCandidate[] = [];
  const dropped: DroppedCandidate[] = [];

  for (const candidate of candidates) {
    const productId = candidate.productId.trim();
    if (!productId || anchors.has(productId)) {
      dropped.push({ productId: productId || candidate.productId, reason: "anchor" });
      continue;
    }
    if (cart.has(productId)) {
      dropped.push({ productId, reason: "in_cart" });
      continue;
    }
    const oos =
      candidate.availableForSale === false ||
      (candidate.inventoryQuantity != null && candidate.inventoryQuantity <= 0);
    if (oos) {
      dropped.push({ productId, reason: "out_of_stock" });
      continue;
    }
    kept.push(candidate);
  }

  return { kept, dropped };
}

/** One row per product: keep strongest relation, merge FBT/similar into affinity and complementary into complementarity. */
export function mergeCandidatesByProduct(candidates: HybridCandidate[]): HybridCandidate[] {
  const merged = new Map<string, HybridCandidate>();
  for (const row of candidates) {
    const existing = merged.get(row.productId);
    if (!existing) {
      merged.set(row.productId, {
        ...row,
        affinity: row.affinity ?? (row.strategy === "complementary" ? 0 : row.relationScore),
        complementarity:
          row.complementarity ?? (row.strategy === "complementary" ? row.relationScore : 0),
      });
      continue;
    }
    const next: HybridCandidate = { ...existing };
    if (row.relationScore > existing.relationScore) {
      next.strategy = row.strategy;
      next.relationScore = row.relationScore;
    }
    next.affinity = Math.max(
      existing.affinity ?? 0,
      row.affinity ?? (row.strategy === "complementary" ? 0 : row.relationScore),
    );
    next.complementarity = Math.max(
      existing.complementarity ?? 0,
      row.complementarity ?? (row.strategy === "complementary" ? row.relationScore : 0),
    );
    next.interest = Math.max(existing.interest ?? 0, row.interest ?? 0);
    next.historicalConversion = Math.max(
      existing.historicalConversion ?? 0,
      row.historicalConversion ?? 0,
    );
    if (existing.inventoryQuantity == null) next.inventoryQuantity = row.inventoryQuantity;
    else if (row.inventoryQuantity != null) {
      next.inventoryQuantity = Math.min(existing.inventoryQuantity, row.inventoryQuantity);
    }
    next.availableForSale = existing.availableForSale && row.availableForSale;
    merged.set(row.productId, next);
  }
  return [...merged.values()];
}

export function applyMerchantRules(
  ranked: ScoredHybridCandidate[],
  merchant: MerchantRules | undefined,
): { kept: ScoredHybridCandidate[]; dropped: DroppedCandidate[] } {
  const exclude = idSet(merchant?.excludeProductIds);
  const include = idSet(merchant?.includeProductIds);
  const maxN = merchant?.maxN ?? MAX_UPSELL_PRODUCTS;
  const dropped: DroppedCandidate[] = [];
  const afterExclude: ScoredHybridCandidate[] = [];

  for (const row of ranked) {
    if (exclude.has(row.productId)) {
      dropped.push({ productId: row.productId, reason: "excluded" });
      continue;
    }
    if (include.size > 0 && !include.has(row.productId)) {
      dropped.push({ productId: row.productId, reason: "not_included" });
      continue;
    }
    afterExclude.push(row);
  }

  const kept = afterExclude.slice(0, Math.max(0, maxN));
  for (const row of afterExclude.slice(kept.length)) {
    dropped.push({ productId: row.productId, reason: "max_n" });
  }
  return { kept, dropped };
}

/**
 * Hybrid recommend: business rules → merge/score candidates → merchant include/exclude/max N.
 * Does not call Shopify, LLM, or eligibility (AI-2.7).
 */
export function runHybridPipeline(input: HybridPipelineInput): HybridPipelineResult {
  const business = applyBusinessRules(input.candidates, input);
  const merged = mergeCandidatesByProduct(business.kept);
  const scored: ScoredHybridCandidate[] = merged.map((candidate) => {
    const inCart = idSet(input.cartProductIds).has(candidate.productId);
    return {
      ...candidate,
      score: scoreCandidate({
        affinity: candidate.affinity ?? 0,
        interest: candidate.interest ?? 0,
        complementarity: candidate.complementarity ?? 0,
        historicalConversion: candidate.historicalConversion ?? 0,
        priceFit: candidate.priceFit ?? 0,
        businessValue: candidate.businessValue ?? 0,
        repetition: candidate.repetition ?? 0,
        availableForSale: candidate.availableForSale,
        inventoryQuantity: candidate.inventoryQuantity,
        inCart,
      }),
    };
  });
  scored.sort((a, b) => compareCandidateScores(a.score, b.score) || b.relationScore - a.relationScore);

  const merchant = applyMerchantRules(scored, input.merchant);
  return {
    ranked: merchant.kept,
    dropped: [...business.dropped, ...merchant.dropped],
  };
}
