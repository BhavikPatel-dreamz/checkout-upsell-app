import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { handleGdprWebhook } from "../models/gdpr.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  const webhookId = request.headers.get("x-shopify-webhook-id");

  await handleGdprWebhook({
    shop,
    topic,
    payload,
    webhookId,
  });

  return new Response();
};
