import type { ActionFunctionArgs } from "react-router";

// Minimal handler to acknowledge incoming Shopify webhook deliveries for
// /webhooks/orders/update while running the dev server. This prevents React
// Router from raising a 404 when Shopify posts to these endpoints in dev.
export const action = async ({ request }: ActionFunctionArgs) => {
  console.log("[webhooks/orders/update] received webhook (dev placeholder)");
  return new Response(null, { status: 200 });
};
