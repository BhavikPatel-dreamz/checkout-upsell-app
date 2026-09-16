import type { ActionFunctionArgs } from "react-router";
import { customerIdKeys, logGdpr } from "../privacy/gdpr.server";
import db from "../db.server";
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
    console.error("[customers/data_request] authenticate.webhook failed", error);
    return new Response(null, { status: 401 });
  }

  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const customer =
    body.customer && typeof body.customer === "object"
      ? (body.customer as Record<string, unknown>)
      : {};
  const keys = customerIdKeys(customer.id);
  const [shopperEvents, browseActivities, offerEvents] = await Promise.all([
    keys.length
      ? db.shopperEvent.count({ where: { shop, customerId: { in: keys } } })
      : 0,
    keys.length
      ? db.browseActivity.count({ where: { shop, customerId: { in: keys } } })
      : 0,
    keys.length ? db.offerEvent.count({ where: { shop, customerId: { in: keys } } }) : 0,
  ]);

  await logGdpr(topic || "customers/data_request", {
    shop,
    customerId: customer.id ?? null,
    stored: { shopperEvents, browseActivities, offerEvents },
  });
  return new Response(null, { status: 200 });
};
