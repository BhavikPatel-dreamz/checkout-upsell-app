import { env } from "../env.server";
import { shopFromAppProxyQuery } from "./appProxySignature.server";
import { shopFromCheckoutSessionToken } from "./checkoutSessionToken.server";

function queryString(url: string): string {
  const start = url.indexOf("?");
  return start === -1 ? "" : url.slice(start + 1);
}

/**
 * Shop bound to a verified checkout session token, or to an app-proxy request
 * whose Shopify signature has been checked. Request body, header, and query
 * shop values are ignored unless that signature check succeeds.
 */
export async function shopFromVerifiedStorefrontRequest(
  request: Request,
): Promise<string | null> {
  const authorization = request.headers.get("Authorization") ?? "";
  if (authorization.startsWith("Bearer ") && authorization.slice(7).trim()) {
    return shopFromCheckoutSessionToken(request);
  }

  return shopFromAppProxyQuery(queryString(request.url), env.shopifyApiSecret);
}
