import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { syncBillingFromShopify } from "../models/billing.server";

/**
 * Welcome link for Shopify App Pricing public plans.
 * Partner Dashboard → plan → Welcome link: /app/billing/return
 * Shopify appends plan_handle after the merchant approves.
 * Entitlement is taken from currentAppInstallation.activeSubscriptions only.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session, redirect } = await authenticate.admin(request);
  await syncBillingFromShopify(session.shop, admin);
  return redirect("/app/billing");
}
