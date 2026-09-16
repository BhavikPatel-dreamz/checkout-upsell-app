import type { ActionFunctionArgs } from "react-router";
import { logGdpr, redactCustomerData } from "../privacy/gdpr.server";
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
    console.error("[customers/redact] authenticate.webhook failed", error);
    return new Response(null, { status: 401 });
  }

  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const customer =
    body.customer && typeof body.customer === "object"
      ? (body.customer as Record<string, unknown>)
      : {};
  const result = await redactCustomerData({
    shop: shop || String(body.shop_domain ?? ""),
    customerId: customer.id,
  });
  await logGdpr(topic || "customers/redact", {
    shop,
    customerId: customer.id ?? null,
    deleted: result.deleted,
  });
  return new Response(null, { status: 200 });
};
