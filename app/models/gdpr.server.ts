import db from "../db.server";

export const GDPR_TOPICS = {
  dataRequest: "customers/data_request",
  customersRedact: "customers/redact",
  shopRedact: "shop/redact",
} as const;

export type GdprTopic = (typeof GDPR_TOPICS)[keyof typeof GDPR_TOPICS];

const GDPR_TOPIC_SET = new Set<string>(Object.values(GDPR_TOPICS));

export function isGdprTopic(value: string): value is GdprTopic {
  return GDPR_TOPIC_SET.has(value);
}

export interface GdprPayloadSummary {
  customerId: string | null;
  customerIdVariants: string[];
  orderIds: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function idString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/** Pull shop-scoped ids from a GDPR payload. Email and phone are ignored. */
export function summarizeGdprPayload(payload: unknown): GdprPayloadSummary {
  const body = asRecord(payload) ?? {};
  const customer = asRecord(body.customer);
  const customerId = idString(customer?.id);
  const customerIdVariants = customerId ? [customerId] : [];
  if (customerId && /^\d+$/.test(customerId)) {
    customerIdVariants.push(`gid://shopify/Customer/${customerId}`);
  }

  const orderIds = new Set<string>();
  for (const key of ["orders_to_redact", "orders_requested"]) {
    const list = body[key];
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      const id = idString(entry) ?? idString(asRecord(entry)?.id);
      if (id) orderIds.add(id);
    }
  }

  return { customerId, customerIdVariants, orderIds: [...orderIds] };
}

/** Create the per-shop policy the first time we see the store. Does not undo a redact. */
export function ensureShopDataPolicy(shop: string) {
  return db.shopDataPolicy.upsert({
    where: { shop },
    create: { shop, dataStorageAllowed: true },
    update: {},
  });
}

/** A store installed or reinstalled the app, so keeping its data is allowed again. */
export function allowShopDataStorage(shop: string) {
  return db.shopDataPolicy.upsert({
    where: { shop },
    create: { shop, dataStorageAllowed: true },
    update: { dataStorageAllowed: true, redactedAt: null },
  });
}

export function getShopDataPolicy(shop: string) {
  return db.shopDataPolicy.findUnique({ where: { shop } });
}

export function listGdprEvents(shop: string, take = 50) {
  return db.gdprEvent.findMany({
    where: { shop },
    orderBy: { receivedAt: "desc" },
    take,
  });
}

async function deleteCustomerData(shop: string, summary: GdprPayloadSummary) {
  if (summary.customerIdVariants.length > 0) {
    await db.offerEvent.deleteMany({
      where: { shop, customerId: { in: summary.customerIdVariants } },
    });
    await db.browseActivity.deleteMany({
      where: { shop, customerId: { in: summary.customerIdVariants } },
    });
    await db.upsellHistory.deleteMany({
      where: { shopdomain: shop, customerId: { in: summary.customerIdVariants } },
    });
  }

  if (summary.orderIds.length > 0) {
    await db.offerEvent.deleteMany({
      where: { shop, orderId: { in: summary.orderIds } },
    });
  }
}

async function deleteShopData(shop: string) {
  const store = await db.storeDetail.findFirst({ where: { url: shop }, select: { id: true } });

  await db.$transaction([
    db.offerEvent.deleteMany({ where: { shop } }),
    db.offer.deleteMany({ where: { shop } }),
    db.browseActivity.deleteMany({ where: { shop } }),
    db.productVariant.deleteMany({ where: { shop } }),
    db.syncLog.deleteMany({ where: { shop } }),
    db.session.deleteMany({ where: { shop } }),
    db.product.deleteMany({ where: { shopDomain: shop } }),
    db.upsellHistory.deleteMany({ where: { shopdomain: shop } }),
    db.discount.deleteMany({ where: { shop } }),
    db.setting.deleteMany({ where: { shopDomain: shop } }),
    db.storeHistory.deleteMany({ where: { shop } }),
    db.jobsHistory.deleteMany({ where: { store: shop } }),
    ...(store
      ? [
          db.recurringApplicationCharge.deleteMany({ where: { clientId: store.id } }),
          db.webhook.deleteMany({ where: { clientId: store.id } }),
        ]
      : []),
    db.storeDetail.deleteMany({ where: { url: shop } }),
    db.subscriptionHistory.deleteMany({ where: { shop } }),
    db.storeBillingOffer.deleteMany({ where: { shop } }),
    db.shop.deleteMany({ where: { shop } }),
    db.shopDataPolicy.update({
      where: { shop },
      data: { dataStorageAllowed: false, redactedAt: new Date() },
    }),
  ]);
}

export async function handleGdprWebhook(input: {
  shop: string;
  topic: string;
  payload: unknown;
  webhookId?: string | null;
}) {
  if (!isGdprTopic(input.topic)) {
    throw new Error(`Unsupported GDPR topic: ${input.topic}`);
  }

  if (input.webhookId) {
    const existing = await db.gdprEvent.findUnique({ where: { webhookId: input.webhookId } });
    if (existing) return existing;
  }

  const summary = summarizeGdprPayload(input.payload);
  await ensureShopDataPolicy(input.shop);

  if (input.topic === GDPR_TOPICS.customersRedact) {
    await deleteCustomerData(input.shop, summary);
  }

  const event = await db.gdprEvent.create({
    data: {
      shop: input.shop,
      topic: input.topic,
      webhookId: input.webhookId || null,
      customerId: summary.customerId,
      status: input.topic === GDPR_TOPICS.dataRequest ? "received" : "completed",
      receivedAt: new Date(),
    },
  });

  if (input.topic === GDPR_TOPICS.shopRedact) {
    await deleteShopData(input.shop);
  }

  return event;
}
