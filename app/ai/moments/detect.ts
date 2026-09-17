export const SMART_MOMENT_KINDS = ["fbt_lift", "complementary_lift", "similar_affinity"] as const;

export type SmartMomentKind = (typeof SMART_MOMENT_KINDS)[number];

export const SMART_MOMENT_DEFAULTS = {
  minSupport: 2,
  minLift: 1.25,
  maxMoments: 25,
} as const;

export interface AffinityPairInput {
  productId: string;
  relatedProductId: string;
  buyBuyCount: number;
  viewViewCount: number;
  atcAtcCount: number;
  score: number;
  relationKind?: "fbt" | "similar" | "complementary" | null;
}

export interface DetectedSmartMoment {
  kind: SmartMomentKind;
  productId: string;
  relatedProductId: string;
  support: number;
  lift: number;
  expectedImpact: number;
  explanation: string;
}

/** Classic association lift: P(A∩B) / (P(A)P(B)) using pair buy counts as the universe. */
export function associationLift(
  coCount: number,
  countA: number,
  countB: number,
  total: number,
): number {
  if (coCount <= 0 || countA <= 0 || countB <= 0 || total <= 0) return 0;
  return (coCount * total) / (countA * countB);
}

export function expectedImpactFromLift(lift: number, support: number): number {
  return Math.round(Math.max(0, support) * Math.max(0, lift - 1) * 100) / 100;
}

function kindFor(pair: AffinityPairInput, useBuys: boolean): SmartMomentKind {
  if (pair.relationKind === "complementary") return "complementary_lift";
  if (pair.relationKind === "similar" || (!useBuys && pair.viewViewCount > 0)) return "similar_affinity";
  return "fbt_lift";
}

/**
 * Rank shop-scoped product pairs by lift. No LLM. Complementary / similar labels
 * come from ProductRelation when present.
 */
export function detectSmartMomentCandidates(
  pairs: AffinityPairInput[],
  options: { minSupport?: number; minLift?: number; max?: number } = {},
): DetectedSmartMoment[] {
  const minSupport = options.minSupport ?? SMART_MOMENT_DEFAULTS.minSupport;
  const minLift = options.minLift ?? SMART_MOMENT_DEFAULTS.minLift;
  const max = options.max ?? SMART_MOMENT_DEFAULTS.maxMoments;

  const buyA = new Map<string, number>();
  const buyB = new Map<string, number>();
  const viewA = new Map<string, number>();
  const viewB = new Map<string, number>();
  let totalBuy = 0;
  let totalView = 0;

  for (const pair of pairs) {
    if (pair.productId === pair.relatedProductId) continue;
    buyA.set(pair.productId, (buyA.get(pair.productId) ?? 0) + pair.buyBuyCount);
    buyB.set(pair.relatedProductId, (buyB.get(pair.relatedProductId) ?? 0) + pair.buyBuyCount);
    viewA.set(pair.productId, (viewA.get(pair.productId) ?? 0) + pair.viewViewCount);
    viewB.set(pair.relatedProductId, (viewB.get(pair.relatedProductId) ?? 0) + pair.viewViewCount);
    totalBuy += pair.buyBuyCount;
    totalView += pair.viewViewCount;
  }

  const out: DetectedSmartMoment[] = [];
  for (const pair of pairs) {
    if (pair.productId === pair.relatedProductId) continue;
    const useBuys = pair.buyBuyCount >= minSupport;
    const support = useBuys ? pair.buyBuyCount : pair.viewViewCount;
    if (support < minSupport) continue;
    const lift = useBuys
      ? associationLift(
          pair.buyBuyCount,
          buyA.get(pair.productId) ?? 0,
          buyB.get(pair.relatedProductId) ?? 0,
          totalBuy,
        )
      : associationLift(
          pair.viewViewCount,
          viewA.get(pair.productId) ?? 0,
          viewB.get(pair.relatedProductId) ?? 0,
          totalView,
        );
    if (lift < minLift) continue;
    const kind = kindFor(pair, useBuys);
    const impact = expectedImpactFromLift(lift, support);
    out.push({
      kind,
      productId: pair.productId,
      relatedProductId: pair.relatedProductId,
      support,
      lift: Math.round(lift * 1000) / 1000,
      expectedImpact: impact,
      explanation: useBuys
        ? `Buy-together lift ${lift.toFixed(2)} (support ${support}). Expected extra attachments ≈ ${impact}.`
        : `Co-view affinity lift ${lift.toFixed(2)} (support ${support}). Expected extra attachments ≈ ${impact}.`,
    });
  }

  out.sort((a, b) => b.expectedImpact - a.expectedImpact || b.lift - a.lift);
  const seen = new Set<string>();
  const unique: DetectedSmartMoment[] = [];
  for (const row of out) {
    const key = `${row.kind}:${row.productId}:${row.relatedProductId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
    if (unique.length >= max) break;
  }
  return unique;
}
