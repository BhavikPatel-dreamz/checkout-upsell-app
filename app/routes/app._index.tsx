import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function DashboardPage() {
  return (
    <s-page heading="Checkout Upsell">
      <s-section heading="Build higher-value carts with relevant offers">
        <s-paragraph>
          Create targeted upsell offers, place them in supported Shopify
          surfaces, and measure their impact on order value.
        </s-paragraph>
      </s-section>
      <s-section heading="Getting started">
        <s-paragraph>
          Start by creating an offer, then add the upsell block in the Theme
          Editor when that integration is available.
        </s-paragraph>
        <s-button href="/app/offers" variant="primary">
          View offers
        </s-button>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
