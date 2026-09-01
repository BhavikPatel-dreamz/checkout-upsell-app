import { useEffect } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { useAppBridge } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import { ensureWebPixel } from "../lib/ensureWebPixel.server";


export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  await ensureWebPixel(admin, session.shop);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

// function RememberAdminAppBase() {
//   const shopify = useAppBridge();
//   useEffect(() => {
//     void shopify.ready.then(() => {
//       rememberAdminAppBase(shopify.config?.host);
//     });
//   }, [shopify]);
//   return null;
// }

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      
      <s-app-nav>
        <s-link href="/app">
          Dashboard
        </s-link>
        <s-link href="/app/offers/new">Create Upsell</s-link>
        <s-link href="/app/upsells">All Upsells</s-link>
        <s-link href="/app/product-sync">Product Sync</s-link>
        <s-link href="/app/analytics">Analytics</s-link>
        <s-link href="/app/settings">Settings</s-link>
        <s-link href="/app/onboarding">Onboarding</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
