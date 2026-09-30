import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { planIdFromShopifyHandle } from "../config/billingPlan";
import { setStorePlan } from "../models/billing.server";

/**
 * Welcome link for Shopify App Pricing public plans.
 * Partner Dashboard → plan → Welcome link: /app/billing/return
 * Shopify appends plan_handle after the merchant approves.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { session, redirect } = await authenticate.admin(request);
  const url = new URL(request.url);
  const plan = planIdFromShopifyHandle(url.searchParams.get("plan_handle"));
  const chargeId = url.searchParams.get("charge_id");
  if (plan) {
    await setStorePlan(session.shop, plan, chargeId);
  }
  return redirect("/app/billing");
}
