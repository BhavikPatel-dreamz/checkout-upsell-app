import { authenticate } from "../shopify.server";
import { shopFromCheckoutSessionToken } from "./checkoutSessionToken.server";

const SHOP_DOMAIN = /^[a-z0-9-]+\.myshopify\.com$/;

function asShopDomain(value: string | null | undefined): string | null {
  if (!value) return null;
  const shop = value.trim().toLowerCase();
  return SHOP_DOMAIN.test(shop) ? shop : null;
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

  try {
    const proxy = await authenticate.public.appProxy(request);
    const signedShop = proxy.session?.shop ?? new URL(request.url).searchParams.get("shop");
    return asShopDomain(signedShop);
  } catch {
    return null;
  }
}
