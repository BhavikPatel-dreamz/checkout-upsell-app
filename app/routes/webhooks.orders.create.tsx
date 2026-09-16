import type { ActionFunctionArgs } from "react-router";
import { emitPurchaseShopperEvents } from "../models/orderPurchase.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  let payload: unknown;
  let shop: string;
  try {
    const authResult = await authenticate.webhook(request);
    payload = authResult.payload;
    shop = authResult.shop;
  } catch (error) {
    console.error("[orders/create] authenticate.webhook failed", error);
    return new Response(null, { status: 401 });
  }

  try {
    await emitPurchaseShopperEvents({ shop, payload });
  } catch (error) {
    console.error("[orders/create] purchase emit failed", error);
    return new Response(null, { status: 500 });
  }

  return new Response(null, { status: 200 });
};
