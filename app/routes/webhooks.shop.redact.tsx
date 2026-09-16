import type { ActionFunctionArgs } from "react-router";
import { logGdpr, redactShopData } from "../privacy/gdpr.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  let payload: unknown;
  let shop: string;
  let topic: string;
  try {
    const auth = await authenticate.webhook(request);
    payload = auth.payload;
    shop = auth.shop;
    topic = auth.topic;
  } catch (error) {
    console.error("[shop/redact] authenticate.webhook failed", error);
    return new Response(null, { status: 401 });
  }

  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const result = await redactShopData(shop || String(body.shop_domain ?? ""));
  await logGdpr(topic || "shop/redact", { shop, deleted: result.deleted });
  return new Response(null, { status: 200 });
};
