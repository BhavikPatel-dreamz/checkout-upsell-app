import { ConsentSubjectType } from "@prisma/client";
import db from "../db.server";
import { getShopPrivacySettings } from "../models/shopPrivacy.server";

const VIEW_NAMES = new Set([
  "product_view",
  "product_click",
  "variant_select",
  "image_view",
  "size_select",
]);
const ATC_NAMES = new Set(["add_to_cart", "recommendation_add"]);
const BUY_NAMES = new Set(["purchase", "recommendation_purchase", "checkout_completed"]);
const AFFINITY_EVENT_NAMES = [...VIEW_NAMES, ...ATC_NAMES, ...BUY_NAMES];

const VIEW_WEIGHT = 1;
const ATC_WEIGHT = 3;
const BUY_WEIGHT = 5;
const RECENCY_HALF_LIFE_DAYS = 30;
const MAX_PRODUCTS_PER_BASKET = 40;
const EVENT_PAGE = 2000;
const INSERT_CHUNK = 500;

export const AFFINITY_SCORE_WEIGHTS = {
  view: VIEW_WEIGHT,
  atc: ATC_WEIGHT,
  buy: BUY_WEIGHT,
  recencyHalfLifeDays: RECENCY_HALF_LIFE_DAYS,
} as const;

type Relation = "view" | "atc" | "buy";

function relationForName(name: string): Relation | null {
  if (VIEW_NAMES.has(name)) return "view";
  if (ATC_NAMES.has(name)) return "atc";
  if (BUY_NAMES.has(name)) return "buy";
  return null;
}

export function affinityScore(input: {
  viewCount: number;
  atcCount: number;
  purchaseCount: number;
  lastOccurredAt: Date;
  now?: Date;
}): number {
  const now = input.now ?? new Date();
  const days = Math.max(0, (now.getTime() - input.lastOccurredAt.getTime()) / 86_400_000);
  const recency = 1 / (1 + days / RECENCY_HALF_LIFE_DAYS);
  const raw =
    input.viewCount * VIEW_WEIGHT +
    input.atcCount * ATC_WEIGHT +
    input.purchaseCount * BUY_WEIGHT;
  return Math.round(raw * recency * 1000) / 1000;
}

function subjectOf(row: {
  customerId: string | null;
  anonId: string | null;
  sessionId: string | null;
}): { subjectType: ConsentSubjectType; subjectId: string } | null {
  if (row.customerId?.trim()) {
    return { subjectType: ConsentSubjectType.customer, subjectId: row.customerId.trim() };
  }
  if (row.anonId?.trim()) {
    return { subjectType: ConsentSubjectType.anon, subjectId: row.anonId.trim() };
  }
  if (row.sessionId?.trim()) {
    return { subjectType: ConsentSubjectType.session, subjectId: row.sessionId.trim() };
  }
  return null;
}

function subjectKey(subjectType: ConsentSubjectType, subjectId: string): string {
  return `${subjectType}:${subjectId}`;
}

function capRecent(ids: Map<string, Date>): string[] {
  return [...ids.entries()]
    .sort((a, b) => b[1].getTime() - a[1].getTime())
    .slice(0, MAX_PRODUCTS_PER_BASKET)
    .map(([id]) => id);
}

async function shopsWithEvents(cutoff: Date, shopFilter?: string): Promise<string[]> {
  if (shopFilter) return [shopFilter];
  const rows = await db.shopperEvent.findMany({
    where: { occurredAt: { gte: cutoff }, productId: { not: null } },
    distinct: ["shop"],
    select: { shop: true },
  });
  const fromShop = await db.shop.findMany({ select: { shop: true } });
  return Array.from(new Set([...rows.map((r) => r.shop), ...fromShop.map((r) => r.shop)]));
}

async function insertChunks<T extends Record<string, unknown>>(
  rows: T[],
  write: (chunk: T[]) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    await write(rows.slice(i, i + INSERT_CHUNK));
  }
}

export interface AffinityJobResult {
  shops: number;
  customerProductRows: number;
  productProductRows: number;
}

export async function rebuildAffinityTables(shopFilter?: string): Promise<AffinityJobResult> {
  const now = new Date();
  // Global cutoff for listing shops; per-shop cutoff uses that shop's retention.
  const listingCutoff = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const shops = await shopsWithEvents(listingCutoff, shopFilter);
  let customerProductRows = 0;
  let productProductRows = 0;

  for (const shop of shops) {
    const counts = await rebuildShopAffinity(shop, now);
    customerProductRows += counts.customerProductRows;
    productProductRows += counts.productProductRows;
  }

  return { shops: shops.length, customerProductRows, productProductRows };
}

async function rebuildShopAffinity(
  shop: string,
  now: Date,
): Promise<{ customerProductRows: number; productProductRows: number }> {
  const settings = await getShopPrivacySettings(shop);
  const cutoff = new Date(now.getTime() - settings.privacyRetentionDays * 24 * 60 * 60 * 1000);

  type CpAgg = {
    subjectType: ConsentSubjectType;
    subjectId: string;
    productId: string;
    viewCount: number;
    atcCount: number;
    purchaseCount: number;
    lastOccurredAt: Date;
  };
  const customer = new Map<string, CpAgg>();
  const baskets = new Map<
    string,
    {
      view: Map<string, Date>;
      atc: Map<string, Date>;
      buy: Map<string, Date>;
    }
  >();

  let cursor: string | undefined;
  for (;;) {
    const page = await db.shopperEvent.findMany({
      where: {
        shop,
        occurredAt: { gte: cutoff },
        consentAnalytics: true,
        productId: { not: null },
        name: { in: AFFINITY_EVENT_NAMES },
      },
      orderBy: { id: "asc" },
      take: EVENT_PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        name: true,
        productId: true,
        customerId: true,
        anonId: true,
        sessionId: true,
        occurredAt: true,
      },
    });
    if (page.length === 0) break;
    cursor = page[page.length - 1].id;

    for (const row of page) {
      const productId = row.productId?.trim();
      const relation = relationForName(row.name);
      const subject = subjectOf(row);
      if (!productId || !relation || !subject) continue;

      const cpKey = `${subjectKey(subject.subjectType, subject.subjectId)}|${productId}`;
      const existing = customer.get(cpKey);
      if (!existing) {
        customer.set(cpKey, {
          subjectType: subject.subjectType,
          subjectId: subject.subjectId,
          productId,
          viewCount: relation === "view" ? 1 : 0,
          atcCount: relation === "atc" ? 1 : 0,
          purchaseCount: relation === "buy" ? 1 : 0,
          lastOccurredAt: row.occurredAt,
        });
      } else {
        if (relation === "view") existing.viewCount += 1;
        if (relation === "atc") existing.atcCount += 1;
        if (relation === "buy") existing.purchaseCount += 1;
        if (row.occurredAt > existing.lastOccurredAt) existing.lastOccurredAt = row.occurredAt;
      }

      const bKey = subjectKey(subject.subjectType, subject.subjectId);
      let basket = baskets.get(bKey);
      if (!basket) {
        basket = { view: new Map(), atc: new Map(), buy: new Map() };
        baskets.set(bKey, basket);
      }
      const bucket = basket[relation];
      const prev = bucket.get(productId);
      if (!prev || row.occurredAt > prev) bucket.set(productId, row.occurredAt);
    }

    if (page.length < EVENT_PAGE) break;
  }

  type PpAgg = {
    productId: string;
    relatedProductId: string;
    viewViewCount: number;
    atcAtcCount: number;
    buyBuyCount: number;
    lastOccurredAt: Date;
  };
  const pairs = new Map<string, PpAgg>();

  const bumpPair = (
    productId: string,
    relatedProductId: string,
    field: "viewViewCount" | "atcAtcCount" | "buyBuyCount",
    at: Date,
  ) => {
    if (productId === relatedProductId) return;
    const key = `${productId}|${relatedProductId}`;
    const row = pairs.get(key);
    if (!row) {
      pairs.set(key, {
        productId,
        relatedProductId,
        viewViewCount: field === "viewViewCount" ? 1 : 0,
        atcAtcCount: field === "atcAtcCount" ? 1 : 0,
        buyBuyCount: field === "buyBuyCount" ? 1 : 0,
        lastOccurredAt: at,
      });
      return;
    }
    row[field] += 1;
    if (at > row.lastOccurredAt) row.lastOccurredAt = at;
  };

  for (const basket of baskets.values()) {
    const viewIds = capRecent(basket.view);
    const atcIds = capRecent(basket.atc);
    const buyIds = capRecent(basket.buy);
    for (const a of viewIds) {
      const at = basket.view.get(a)!;
      for (const b of viewIds) bumpPair(a, b, "viewViewCount", at);
    }
    for (const a of atcIds) {
      const at = basket.atc.get(a)!;
      for (const b of atcIds) bumpPair(a, b, "atcAtcCount", at);
    }
    for (const a of buyIds) {
      const at = basket.buy.get(a)!;
      for (const b of buyIds) bumpPair(a, b, "buyBuyCount", at);
    }
  }

  const customerRows = [...customer.values()].map((row) => ({
    shop,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    productId: row.productId,
    viewCount: row.viewCount,
    atcCount: row.atcCount,
    purchaseCount: row.purchaseCount,
    lastOccurredAt: row.lastOccurredAt,
    score: affinityScore({
      viewCount: row.viewCount,
      atcCount: row.atcCount,
      purchaseCount: row.purchaseCount,
      lastOccurredAt: row.lastOccurredAt,
      now,
    }),
    computedAt: now,
  }));

  const pairRows = [...pairs.values()].map((row) => ({
    shop,
    productId: row.productId,
    relatedProductId: row.relatedProductId,
    viewViewCount: row.viewViewCount,
    atcAtcCount: row.atcAtcCount,
    buyBuyCount: row.buyBuyCount,
    lastOccurredAt: row.lastOccurredAt,
    score: affinityScore({
      viewCount: row.viewViewCount,
      atcCount: row.atcAtcCount,
      purchaseCount: row.buyBuyCount,
      lastOccurredAt: row.lastOccurredAt,
      now,
    }),
    computedAt: now,
  }));

  await db.$transaction([
    db.customerProductAffinity.deleteMany({ where: { shop } }),
    db.productProductAffinity.deleteMany({ where: { shop } }),
  ]);

  await insertChunks(customerRows, (chunk) => db.customerProductAffinity.createMany({ data: chunk }));
  await insertChunks(pairRows, (chunk) => db.productProductAffinity.createMany({ data: chunk }));

  return {
    customerProductRows: customerRows.length,
    productProductRows: pairRows.length,
  };
}
