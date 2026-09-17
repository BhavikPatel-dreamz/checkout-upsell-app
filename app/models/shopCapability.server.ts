import db from "../db.server";

export function checkoutCapabilityAllows(input: {
  shopifyPlus?: boolean | null;
  partnerDevelopment?: boolean | null;
}): boolean {
  if (process.env.AI_CHECKOUT_PLUS === "1") return true;
  return Boolean(input.shopifyPlus || input.partnerDevelopment);
}

export async function shopAllowsCheckoutDecide(shop: string): Promise<boolean> {
  if (process.env.AI_CHECKOUT_PLUS === "1") return true;
  const row = await db.shop.findUnique({
    where: { shop },
    select: { shopifyPlus: true, partnerDevelopment: true },
  });
  if (!row) return false;
  return checkoutCapabilityAllows(row);
}

type AdminGraphql = {
  graphql: (query: string) => Promise<Response>;
};

export async function refreshShopCheckoutCapability(
  shop: string,
  admin: AdminGraphql,
): Promise<{ shopifyPlus: boolean; partnerDevelopment: boolean }> {
  let shopifyPlus = false;
  let partnerDevelopment = false;
  try {
    const response = await admin.graphql(`#graphql
      query ShopCheckoutCapability {
        shop {
          plan {
            shopifyPlus
            partnerDevelopment
          }
        }
      }
    `);
    const json = (await response.json()) as {
      data?: { shop?: { plan?: { shopifyPlus?: boolean; partnerDevelopment?: boolean } } };
    };
    shopifyPlus = Boolean(json.data?.shop?.plan?.shopifyPlus);
    partnerDevelopment = Boolean(json.data?.shop?.plan?.partnerDevelopment);
  } catch {
    const existing = await db.shop.findUnique({
      where: { shop },
      select: { shopifyPlus: true, partnerDevelopment: true },
    });
    return {
      shopifyPlus: existing?.shopifyPlus ?? false,
      partnerDevelopment: existing?.partnerDevelopment ?? false,
    };
  }

  await db.shop.upsert({
    where: { shop },
    create: { shop, shopifyPlus, partnerDevelopment },
    update: { shopifyPlus, partnerDevelopment },
  });
  return { shopifyPlus, partnerDevelopment };
}
