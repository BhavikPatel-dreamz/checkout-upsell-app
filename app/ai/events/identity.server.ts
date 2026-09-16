import { ConsentSubjectType } from "@prisma/client";
import db from "../../db.server";

export interface IdentitySighting {
  shop: string;
  sessionId?: string | null;
  anonId?: string | null;
  customerId?: string | null;
  source?: string;
}

function trim(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const next = value.trim();
  return next.length > 0 ? next : null;
}

async function linkedCustomer(
  shop: string,
  fromType: ConsentSubjectType,
  fromId: string,
): Promise<string | null> {
  const row = await db.identityLink.findFirst({
    where: { shop, fromType, fromId, toType: ConsentSubjectType.customer },
    orderBy: { createdAt: "asc" },
    select: { toId: true },
  });
  return row?.toId ?? null;
}

async function upsertLink(input: {
  shop: string;
  fromType: ConsentSubjectType;
  fromId: string;
  toType: ConsentSubjectType;
  toId: string;
  source: string;
}): Promise<void> {
  if (input.fromType === input.toType && input.fromId === input.toId) return;
  if (input.toType === ConsentSubjectType.customer) {
    const existing = await linkedCustomer(input.shop, input.fromType, input.fromId);
    if (existing && existing !== input.toId) return;
  }
  await db.identityLink.upsert({
    where: {
      shop_fromType_fromId_toType_toId: {
        shop: input.shop,
        fromType: input.fromType,
        fromId: input.fromId,
        toType: input.toType,
        toId: input.toId,
      },
    },
    create: input,
    update: {},
  });
}

async function stampCustomerOnPriorEvents(
  shop: string,
  customerId: string,
  sessionId: string | null,
  anonId: string | null,
): Promise<void> {
  const or = [
    ...(sessionId ? [{ sessionId }] : []),
    ...(anonId ? [{ anonId }] : []),
  ];
  if (or.length === 0) return;
  await db.shopperEvent.updateMany({
    where: { shop, customerId: null, OR: or },
    data: { customerId },
  });
}

/** Record shop-scoped aliases when a session/anon is seen with a logged-in customer. */
export async function recordIdentitySighting(input: IdentitySighting): Promise<void> {
  const shop = trim(input.shop);
  if (!shop) return;
  const sessionId = trim(input.sessionId);
  const anonId = trim(input.anonId);
  const customerId = trim(input.customerId);
  const source = trim(input.source) ?? "ingest";

  if (sessionId && anonId) {
    await upsertLink({
      shop,
      fromType: ConsentSubjectType.session,
      fromId: sessionId,
      toType: ConsentSubjectType.anon,
      toId: anonId,
      source,
    });
  }
  if (sessionId && customerId) {
    await upsertLink({
      shop,
      fromType: ConsentSubjectType.session,
      fromId: sessionId,
      toType: ConsentSubjectType.customer,
      toId: customerId,
      source,
    });
  }
  if (anonId && customerId) {
    await upsertLink({
      shop,
      fromType: ConsentSubjectType.anon,
      fromId: anonId,
      toType: ConsentSubjectType.customer,
      toId: customerId,
      source,
    });
  }
  if (customerId && (sessionId || anonId)) {
    await stampCustomerOnPriorEvents(shop, customerId, sessionId, anonId);
  }
}

export async function resolveCustomerId(
  shop: string,
  identity: { sessionId?: string | null; anonId?: string | null; customerId?: string | null },
): Promise<string | null> {
  const shopKey = trim(shop);
  const customerId = trim(identity.customerId);
  if (!shopKey) return customerId;
  if (customerId) return customerId;
  const sessionId = trim(identity.sessionId);
  const anonId = trim(identity.anonId);
  if (sessionId) {
    const fromSession = await linkedCustomer(shopKey, ConsentSubjectType.session, sessionId);
    if (fromSession) return fromSession;
  }
  if (anonId) {
    return linkedCustomer(shopKey, ConsentSubjectType.anon, anonId);
  }
  return null;
}
