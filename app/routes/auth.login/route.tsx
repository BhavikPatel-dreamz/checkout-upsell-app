import { AppProvider } from "@shopify/shopify-app-react-router/react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    return { errors: loginErrorMessage(await login(request)) };
  }

  return { errors: {} as { shop?: string } };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const url = new URL(request.url);
  if (!url.searchParams.get("shop")) {
    throw redirect("/");
  }

  return { errors: loginErrorMessage(await login(request)) };
};

export default function Auth() {
  return (
    <AppProvider embedded={false}>
      <s-page>
        <s-section heading="Open from Shopify">
          <s-paragraph>
            Checkout Upsell App is installed from the Shopify App Store or opened from Shopify
            Admin. This page does not collect a store domain.
          </s-paragraph>
        </s-section>
      </s-page>
    </AppProvider>
  );
}
