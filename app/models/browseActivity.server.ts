import { BrowseActivityType, OfferEventType, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { browseActivityToShopperCreateData } from "../ai/events/fromBrowseActivity";
import { recordIdentitySighting } from "../ai/events/identity.server";
import {
  allowsAnalyticsPersistence,
  isShopperEventName,
  parseShopperEventEnvelope,
  toShopperEventCreateData,
  type ShopperEventName,
  type ShopperEventSurface,
} from "../ai/events/envelope";
import db from "../db.server";

export const ACTIVITY_TTL_DAYS = 30;
export const BROWSE_TO_OFFER_WINDOW_MS = 1000 * 60 * 60 * 24;

const EVENT_TYPES = new Set<string>(Object.values(BrowseActivityType));

export interface RecordBrowseActivityInput {
  shop: string;
  eventType: string;
  customerId?: string | null;
  guestKey?: string | null;
  clientId?: string | null;
  productId?: string | null;
  variantId?: string | null;
  collectionId?: string | null;
  query?: string | null;
  occurredAt?: Date | string | number | null;
  consented?: boolean;
  customName?: string | null;
  eventId?: string | null;
  surface?: string | null;
  source?: string | null;
}

export interface BrowseActivityRow {
  eventType: BrowseActivityType;
  customerId: string | null;
  guestKey: string | null;
  clientId: string | null;
  productId: string | null;
  variantId: string | null;
  collectionId: string | null;
  query: string | null;
  occurredAt: Date;
}

export interface IdentityLookup {
  customerId?: string | null;
  guestKey?: string | null;
  clientId?: string | null;
}

function trimOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseOccurredAt(value: Date | string | number | null | undefined): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    const parsed = new Date(ms);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function identityWhere(shop: string, identity: IdentityLookup, since: Date): Prisma.BrowseActivityWhereInput {
  const or: Prisma.BrowseActivityWhereInput[] = [];
  if (identity.customerId) or.push({ customerId: identity.customerId });
  if (identity.guestKey) {
    or.push({ guestKey: identity.guestKey });
    or.push({ clientId: identity.guestKey });
  }
  if (identity.clientId) {
    or.push({ clientId: identity.clientId });
    or.push({ guestKey: identity.clientId });
  }

  return {
    shop,
    occurredAt: { gte: since },
    ...(or.length > 0 ? { OR: or } : { id: { in: [] } }),
  };
}

function toShopifyGid(type: "Product" | "ProductVariant" | "Collection" | "Customer", value: string | null): string | null {
  if (!value) return null;
  if (value.indexOf("gid://") === 0) return value;
  const numeric = value.match(/(\d+)\s*$/);
  if (!numeric) return value;
  return `gid://shopify/${type}/${numeric[1]}`;
}

export async function recordBrowseActivity(
  input: RecordBrowseActivityInput,
): Promise<{ recorded: boolean; skipped?: string; id?: string }> {
  if (input.consented === false) {
    return { recorded: false, skipped: "consent" };
  }

  const shop = trimOrNull(input.shop);
  const eventType = trimOrNull(input.eventType);
  if (!shop || !eventType || !EVENT_TYPES.has(eventType)) {
    return { recorded: false, skipped: "invalid" };
  }

  const customerId = toShopifyGid("Customer", trimOrNull(input.customerId));
  const guestKey = trimOrNull(input.guestKey);
  const clientId = trimOrNull(input.clientId);

  if (!customerId && !guestKey && !clientId) {
    return { recorded: false, skipped: "identity" };
  }

  const cutoff = new Date(Date.now() - ACTIVITY_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.browseActivity.deleteMany({
    where: { shop, occurredAt: { lt: cutoff } },
  });

  const productId = toShopifyGid("Product", trimOrNull(input.productId));
  const variantId = toShopifyGid("ProductVariant", trimOrNull(input.variantId));
  const collectionId = toShopifyGid("Collection", trimOrNull(input.collectionId));
  const query = trimOrNull(input.query)?.slice(0, 200) ?? null;

  const duplicateSince = new Date(Date.now() - 15_000);
  const duplicate = await db.browseActivity.findFirst({
    where: {
      ...identityWhere(shop, { customerId, guestKey, clientId }, duplicateSince),
      eventType: eventType as BrowseActivityType,
      productId,
      variantId,
      collectionId,
      query,
    },
    select: { id: true },
  });
  if (duplicate) {
    return { recorded: false, skipped: "duplicate", id: duplicate.id };
  }

  const occurredAt = parseOccurredAt(input.occurredAt);
  const created = await db.browseActivity.create({
    data: {
      shop,
      eventType: eventType as BrowseActivityType,
      customerId,
      guestKey,
      clientId,
      productId,
      variantId,
      collectionId,
      query,
      occurredAt,
    },
  });

  await dualWriteShopperEvent({
    shop,
    eventId: created.id,
    eventType: created.eventType,
    occurredAt,
    customerId,
    guestKey,
    clientId,
    productId,
    variantId,
    collectionId,
    query,
  });

  await rememberIdentity({ shop, customerId, guestKey, clientId });

  return { recorded: true, id: created.id };
}

const CUSTOM_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;

function resolveShopperName(eventType: string, customName: string | null): {
  name: ShopperEventName;
  customName: string | null;
} | null {
  if (isShopperEventName(eventType) && eventType !== "custom") {
    return { name: eventType, customName: null };
  }
  const slug = customName || (eventType === "custom" ? null : eventType);
  if (slug && CUSTOM_NAME_RE.test(slug)) {
    return { name: "custom", customName: slug };
  }
  return null;
}

function asSurface(value: string | null): ShopperEventSurface {
  if (
    value === "theme_block" ||
    value === "pixel" ||
    value === "checkout_ui" ||
    value === "post_purchase" ||
    value === "admin"
  ) {
    return value;
  }
  return "theme_block";
}

/** Browse types stay on BrowseActivity (ranker). Other / custom events go to ShopperEvent only. */
export async function recordStorefrontActivity(
  input: RecordBrowseActivityInput,
): Promise<{ recorded: boolean; skipped?: string; id?: string }> {
  const eventType = trimOrNull(input.eventType);
  if (eventType && EVENT_TYPES.has(eventType)) {
    return recordBrowseActivity(input);
  }
  return recordShopperOnlyActivity(input);
}

async function recordShopperOnlyActivity(
  input: RecordBrowseActivityInput,
): Promise<{ recorded: boolean; skipped?: string; id?: string }> {
  if (input.consented === false) {
    return { recorded: false, skipped: "consent" };
  }

  const shop = trimOrNull(input.shop);
  const eventType = trimOrNull(input.eventType);
  const customName = trimOrNull(input.customName);
  if (!shop || !eventType) {
    return { recorded: false, skipped: "invalid" };
  }

  const resolved = resolveShopperName(eventType, customName);
  if (!resolved) {
    return { recorded: false, skipped: "invalid" };
  }

  const customerId = toShopifyGid("Customer", trimOrNull(input.customerId));
  const guestKey = trimOrNull(input.guestKey);
  const clientId = trimOrNull(input.clientId);
  if (!customerId && !guestKey && !clientId) {
    return { recorded: false, skipped: "identity" };
  }

  const productId = toShopifyGid("Product", trimOrNull(input.productId));
  const variantId = toShopifyGid("ProductVariant", trimOrNull(input.variantId));
  const collectionId = toShopifyGid("Collection", trimOrNull(input.collectionId));
  const query = trimOrNull(input.query)?.slice(0, 200) ?? null;
  const eventId = trimOrNull(input.eventId) ?? randomUUID();
  const occurredAt = parseOccurredAt(input.occurredAt);

  const parsed = parseShopperEventEnvelope({
    schemaVersion: 1,
    shop,
    eventId,
    occurredAt,
    sessionId: guestKey,
    customerId,
    anonId: clientId ?? guestKey,
    consent: { analytics: true, marketing: false },
    name: resolved.name,
    source: trimOrNull(input.source) ?? "class_tracker",
    surface: asSurface(trimOrNull(input.surface)),
    entities: {
      ...(productId ? { productId } : {}),
      ...(variantId ? { variantId } : {}),
      ...(collectionId ? { collectionId } : {}),
      ...(query ? { query } : {}),
      ...(resolved.customName ? { customName: resolved.customName } : {}),
    },
  });

  if (!parsed.ok) {
    return { recorded: false, skipped: "invalid" };
  }
  if (!allowsAnalyticsPersistence(parsed.data)) {
    return { recorded: false, skipped: "consent" };
  }

  const data = toShopperEventCreateData(parsed.data);
  const created = await db.shopperEvent.upsert({
    where: { shop_eventId: { shop: data.shop, eventId: data.eventId } },
    create: data,
    update: {},
  });
  await rememberIdentity({ shop, customerId, guestKey, clientId });
  return { recorded: true, id: created.id };
}

async function rememberIdentity(input: {
  shop: string;
  customerId: string | null;
  guestKey: string | null;
  clientId: string | null;
}): Promise<void> {
  try {
    await recordIdentitySighting({
      shop: input.shop,
      sessionId: input.guestKey,
      anonId: input.clientId ?? input.guestKey,
      customerId: input.customerId,
      source: "activity",
    });
  } catch (error) {
    console.error("[browseActivity] identity link failed", error);
  }
}

async function dualWriteShopperEvent(input: {
  shop: string;
  eventId: string;
  eventType: BrowseActivityType;
  occurredAt: Date;
  customerId: string | null;
  guestKey: string | null;
  clientId: string | null;
  productId: string | null;
  variantId: string | null;
  collectionId: string | null;
  query: string | null;
}): Promise<void> {
  const data = browseActivityToShopperCreateData(input);
  if (!data) return;
  try {
    await db.shopperEvent.upsert({
      where: { shop_eventId: { shop: data.shop, eventId: data.eventId } },
      create: data,
      update: {},
    });
  } catch (error) {
    console.error("[browseActivity] ShopperEvent dual-write failed", error);
  }
}

export async function loadRecentActivity(
  shop: string,
  identity: IdentityLookup,
  days = ACTIVITY_TTL_DAYS,
): Promise<BrowseActivityRow[]> {
  const hasIdentity = Boolean(identity.customerId || identity.guestKey || identity.clientId);
  if (!hasIdentity) return [];

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return db.browseActivity.findMany({
    where: identityWhere(shop, identity, since),
    orderBy: { occurredAt: "desc" },
    take: 200,
    select: {
      eventType: true,
      customerId: true,
      guestKey: true,
      clientId: true,
      productId: true,
      variantId: true,
      collectionId: true,
      query: true,
      occurredAt: true,
    },
  });
}

export interface BrowseToOfferMetrics {
  browseIdentities: number;
  offerViewIdentities: number;
  overlap: number;
  browseToOfferRate: number | null;
}

function identityKey(row: { customerId?: string | null; guestKey?: string | null; clientId?: string | null }): string[] {
  const keys: string[] = [];
  if (row.customerId) keys.push(`c:${row.customerId}`);
  if (row.guestKey) keys.push(`g:${row.guestKey}`);
  if (row.clientId) keys.push(`g:${row.clientId}`);
  if (row.clientId) keys.push(`i:${row.clientId}`);
  return keys;
}

export async function getBrowseToOfferMetrics(
  shop: string,
  options?: { offerId?: string | null; dateFrom?: Date | null; dateTo?: Date | null },
): Promise<BrowseToOfferMetrics> {
  const dateFrom = options?.dateFrom ?? new Date(Date.now() - ACTIVITY_TTL_DAYS * 24 * 60 * 60 * 1000);
  const dateTo = options?.dateTo ?? new Date();

  const [activityRows, viewRows] = await Promise.all([
    db.browseActivity.findMany({
      where: {
        shop,
        occurredAt: { gte: dateFrom, lte: dateTo },
      },
      select: { customerId: true, guestKey: true, clientId: true, occurredAt: true },
    }),
    db.offerEvent.findMany({
      where: {
        shop,
        eventType: OfferEventType.viewed,
        createdAt: { gte: dateFrom, lte: dateTo },
        ...(options?.offerId ? { offerId: options.offerId } : {}),
      },
      select: { customerId: true, guestKey: true, createdAt: true },
    }),
  ]);

  const browseKeys = new Set<string>();
  const firstBrowseAt = new Map<string, Date>();
  for (const row of activityRows) {
    for (const key of identityKey(row)) {
      browseKeys.add(key);
      const prev = firstBrowseAt.get(key);
      if (!prev || row.occurredAt < prev) firstBrowseAt.set(key, row.occurredAt);
    }
  }

  const viewKeys = new Set<string>();
  let overlap = 0;
  const counted = new Set<string>();
  for (const row of viewRows) {
    const keys = identityKey({ customerId: row.customerId, guestKey: row.guestKey, clientId: row.guestKey });
    for (const key of keys) viewKeys.add(key);
    const matched = keys.find((key) => browseKeys.has(key));
    if (!matched || counted.has(matched)) continue;
    const browseAt = firstBrowseAt.get(matched);
    if (!browseAt) continue;
    if (row.createdAt.getTime() - browseAt.getTime() > BROWSE_TO_OFFER_WINDOW_MS) continue;
    if (row.createdAt < browseAt) continue;
    counted.add(matched);
    overlap += 1;
  }

  const browseIdentities = browseKeys.size;
  const offerViewIdentities = viewKeys.size;
  return {
    browseIdentities,
    offerViewIdentities,
    overlap,
    browseToOfferRate: browseIdentities > 0 ? overlap / browseIdentities : null,
  };
}
