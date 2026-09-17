import { randomUUID } from "node:crypto";
import db from "../../db.server";
import { runHybridRecommend } from "../recommend/hybridRecommend.server";
import {
  identityKey,
  type DecideProduct,
  type DecideRequest,
  type DecideResponse,
  type DecideSurface,
} from "./contract";
import { assignHoldout } from "./holdout";

const STUB_INTENT = { state: "EXPLORING", purchaseIntent: 0 } as const;

function channelForSurface(surface: DecideSurface): DecideSurface {
  return surface;
}

async function productsFromHybrid(input: DecideRequest & { shop: string }): Promise<DecideProduct[]> {
  const anchors = [...new Set([...(input.productIds ?? []), ...(input.cartProductIds ?? [])])];
  if (anchors.length === 0) return [];

  const hybrid = await runHybridRecommend({
    shop: input.shop,
    productIds: anchors,
    cartProductIds: input.cartProductIds ?? [],
    customerId: input.customerId ?? null,
  });

  const products: DecideProduct[] = [];
  for (const row of hybrid.ranked) {
    const variant = await db.productVariant.findFirst({
      where: { shop: input.shop, productId: row.productId, availableForSale: true },
      select: { variantId: true },
      orderBy: { inventoryQuantity: "desc" },
    });
    products.push({
      productId: row.productId,
      variantId: variant?.variantId ?? null,
      strategy: row.strategy,
      score: row.score.total,
    });
  }
  return products;
}

export function buildDecideResponse(input: {
  surface: DecideSurface;
  holdout: boolean;
  products?: DecideProduct[];
  recommendationId?: string;
}): DecideResponse {
  const holdout = input.holdout;
  const products = holdout ? [] : (input.products ?? []);
  const show = !holdout && products.length > 0;
  return {
    show,
    experience: { channel: channelForSurface(input.surface), templateId: "default" },
    products,
    offer: { type: "none", value: null },
    copy: { headline: "", cta: "" },
    recommendationId: input.recommendationId ?? randomUUID(),
    intent: { ...STUB_INTENT },
    holdout,
  };
}

export async function decideForRequest(input: DecideRequest & { shop: string }): Promise<DecideResponse> {
  const recommendationId = randomUUID();
  const holdout = assignHoldout(input.shop, identityKey(input));
  const consented = input.consented !== false;

  if (holdout || !consented) {
    return buildDecideResponse({
      surface: input.surface,
      holdout,
      products: [],
      recommendationId,
    });
  }

  const products = await productsFromHybrid(input);
  return buildDecideResponse({
    surface: input.surface,
    holdout: false,
    products,
    recommendationId,
  });
}
