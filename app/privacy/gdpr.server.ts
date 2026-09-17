import { ConsentSubjectType } from "@prisma/client";
import db from "../db.server";

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

export function customerIdKeys(raw: unknown): string[] {
  const value = asString(raw);
  if (!value) return [];
  const numeric = value.match(/(\d+)\s*$/)?.[1] ?? null;
  const gid = value.startsWith("gid://") ? value : numeric ? `gid://shopify/Customer/${numeric}` : value;
  return Array.from(new Set([value, gid, numeric].filter((item): item is string => Boolean(item))));
}

async function relatedIdentityIds(shop: string, customerKeys: string[]): Promise<{
  sessions: string[];
  anons: string[];
}> {
  if (customerKeys.length === 0) return { sessions: [], anons: [] };
  const links = await db.identityLink.findMany({
    where: {
      shop,
      OR: [
        { fromType: ConsentSubjectType.customer, fromId: { in: customerKeys } },
        { toType: ConsentSubjectType.customer, toId: { in: customerKeys } },
      ],
    },
  });
  const sessions = new Set<string>();
  const anons = new Set<string>();
  for (const link of links) {
    if (link.fromType === ConsentSubjectType.session) sessions.add(link.fromId);
    if (link.toType === ConsentSubjectType.session) sessions.add(link.toId);
    if (link.fromType === ConsentSubjectType.anon) anons.add(link.fromId);
    if (link.toType === ConsentSubjectType.anon) anons.add(link.toId);
  }
  return { sessions: [...sessions], anons: [...anons] };
}

export async function redactCustomerData(input: {
  shop: string;
  customerId: unknown;
}): Promise<{ deleted: Record<string, number> }> {
  const shop = asString(input.shop);
  const keys = customerIdKeys(input.customerId);
  if (!shop || keys.length === 0) {
    return {
      deleted: {
        shopperEvents: 0,
        browseActivities: 0,
        offerEvents: 0,
        identityLinks: 0,
        consentStates: 0,
        upsellHistory: 0,
        customerProductAffinity: 0,
        shopperProfiles: 0,
        shopperIntentSnapshots: 0,
      },
    };
  }

  const { sessions, anons } = await relatedIdentityIds(shop, keys);
  const guestKeys = [...sessions, ...anons];

  const shopperWhere = {
    shop,
    OR: [
      { customerId: { in: keys } },
      ...(sessions.length ? [{ sessionId: { in: sessions } }] : []),
      ...(anons.length ? [{ anonId: { in: anons } }] : []),
    ],
  };
  const browseWhere = {
    shop,
    OR: [
      { customerId: { in: keys } },
      ...(guestKeys.length ? [{ guestKey: { in: guestKeys } }, { clientId: { in: guestKeys } }] : []),
    ],
  };
  const offerWhere = {
    shop,
    OR: [
      { customerId: { in: keys } },
      ...(guestKeys.length ? [{ guestKey: { in: guestKeys } }] : []),
    ],
  };
  const identityWhere = {
    shop,
    OR: [
      { fromId: { in: [...keys, ...guestKeys] } },
      { toId: { in: [...keys, ...guestKeys] } },
    ],
  };
  const consentWhere = {
    shop,
    subjectId: { in: [...keys, ...guestKeys] },
  };

  const [
    shopperEvents,
    browseActivities,
    offerEvents,
    identityLinks,
    consentStates,
    upsellHistory,
    customerProductAffinity,
    shopperProfiles,
    shopperIntentSnapshots,
  ] = await Promise.all([
    db.shopperEvent.deleteMany({ where: shopperWhere }),
    db.browseActivity.deleteMany({ where: browseWhere }),
    db.offerEvent.deleteMany({ where: offerWhere }),
    db.identityLink.deleteMany({ where: identityWhere }),
    db.consentState.deleteMany({ where: consentWhere }),
    db.upsellHistory.deleteMany({
      where: { shopdomain: shop, customerId: { in: keys } },
    }),
    db.customerProductAffinity.deleteMany({
      where: {
        shop,
        OR: [
          { subjectType: ConsentSubjectType.customer, subjectId: { in: keys } },
          ...(sessions.length
            ? [{ subjectType: ConsentSubjectType.session, subjectId: { in: sessions } }]
            : []),
          ...(anons.length
            ? [{ subjectType: ConsentSubjectType.anon, subjectId: { in: anons } }]
            : []),
        ],
      },
    }),
    db.shopperProfile.deleteMany({
      where: { shop, subjectId: { in: [...keys, ...guestKeys] } },
    }),
    db.shopperIntentSnapshot.deleteMany({
      where: { shop, subjectId: { in: [...keys, ...guestKeys] } },
    }),
  ]);

  return {
    deleted: {
      shopperEvents: shopperEvents.count,
      browseActivities: browseActivities.count,
      offerEvents: offerEvents.count,
      identityLinks: identityLinks.count,
      consentStates: consentStates.count,
      upsellHistory: upsellHistory.count,
      customerProductAffinity: customerProductAffinity.count,
      shopperProfiles: shopperProfiles.count,
      shopperIntentSnapshots: shopperIntentSnapshots.count,
    },
  };
}

export async function redactShopData(shopDomain: string): Promise<{ deleted: Record<string, number> }> {
  const shop = asString(shopDomain);
  if (!shop) {
    return {
      deleted: {
        shopperEvents: 0,
        browseActivities: 0,
        offerEvents: 0,
        identityLinks: 0,
        consentStates: 0,
        upsellHistory: 0,
        customerProductAffinity: 0,
        productProductAffinity: 0,
        productRelations: 0,
        merchantRuleSets: 0,
        shopperProfiles: 0,
        shopperIntentSnapshots: 0,
        campaigns: 0,
      },
    };
  }

  const [
    shopperEvents,
    browseActivities,
    offerEvents,
    identityLinks,
    consentStates,
    upsellHistory,
    customerProductAffinity,
    productProductAffinity,
    productRelations,
    merchantRuleSets,
    shopperProfiles,
    shopperIntentSnapshots,
    campaigns,
  ] = await Promise.all([
    db.shopperEvent.deleteMany({ where: { shop } }),
    db.browseActivity.deleteMany({ where: { shop } }),
    db.offerEvent.deleteMany({ where: { shop } }),
    db.identityLink.deleteMany({ where: { shop } }),
    db.consentState.deleteMany({ where: { shop } }),
    db.upsellHistory.deleteMany({ where: { shopdomain: shop } }),
    db.customerProductAffinity.deleteMany({ where: { shop } }),
    db.productProductAffinity.deleteMany({ where: { shop } }),
    db.productRelation.deleteMany({ where: { shop } }),
    db.merchantRuleSet.deleteMany({ where: { shop } }),
    db.shopperProfile.deleteMany({ where: { shop } }),
    db.shopperIntentSnapshot.deleteMany({ where: { shop } }),
    db.campaign.deleteMany({ where: { shop } }),
  ]);

  return {
    deleted: {
      shopperEvents: shopperEvents.count,
      browseActivities: browseActivities.count,
      offerEvents: offerEvents.count,
      identityLinks: identityLinks.count,
      consentStates: consentStates.count,
      upsellHistory: upsellHistory.count,
      customerProductAffinity: customerProductAffinity.count,
      productProductAffinity: productProductAffinity.count,
      productRelations: productRelations.count,
      merchantRuleSets: merchantRuleSets.count,
      shopperProfiles: shopperProfiles.count,
      shopperIntentSnapshots: shopperIntentSnapshots.count,
      campaigns: campaigns.count,
    },
  };
}

export async function logGdpr(topic: string, summary: Record<string, unknown>): Promise<void> {
  await db.gdpr.create({
    data: {
      topic: topic.slice(0, 25),
      response: JSON.stringify(summary),
    },
  });
}
