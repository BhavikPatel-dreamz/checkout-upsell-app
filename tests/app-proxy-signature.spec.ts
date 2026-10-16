import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  appProxySignatureMatches,
  appProxySignatureMessage,
  shopFromAppProxyQuery,
} from "../app/lib/appProxySignature.server";

const SECRET = "hush";
const NOW = 1317327555;

const LOGGED_IN_MESSAGE =
  "extra=1,2logged_in_customer_id=1path_prefix=/apps/awesome_reviewsshop={shop}.myshopify.comtimestamp=1317327555";
const ANONYMOUS_MESSAGE =
  "extra=1,2logged_in_customer_id=path_prefix=/apps/awesome_reviewsshop={shop}.myshopify.comtimestamp=1317327555";

function signed(search: string, message: string) {
  const signature = createHmac("sha256", SECRET).update(message).digest("hex");
  return `${search}&signature=${signature}`;
}

const LOGGED_IN = signed(
  "extra=1&extra=2&shop={shop}.myshopify.com&logged_in_customer_id=1&path_prefix=%2Fapps%2Fawesome_reviews&timestamp=1317327555",
  LOGGED_IN_MESSAGE,
);
const ANONYMOUS = signed(
  "extra=1&extra=2&shop={shop}.myshopify.com&logged_in_customer_id=&path_prefix=%2Fapps%2Fawesome_reviews&timestamp=1317327555",
  ANONYMOUS_MESSAGE,
);

describe("app proxy signature", () => {
  it("matches Shopify's documented message, including repeated keys", () => {
    expect(appProxySignatureMessage(LOGGED_IN)).toBe(LOGGED_IN_MESSAGE);
    expect(appProxySignatureMessage(ANONYMOUS)).toBe(ANONYMOUS_MESSAGE);
    expect(appProxySignatureMatches(LOGGED_IN, SECRET, NOW)).toBe(true);
    expect(appProxySignatureMatches(ANONYMOUS, SECRET, NOW)).toBe(true);
  });

  it("keeps both shop values and uses the shop Shopify appended", () => {
    const searchWithoutSignature = [
      "shop=attacker.myshopify.com",
      "placement=cart_drawer",
      "variantIds=gid://shopify/ProductVariant/1",
      "guestKey=guest-1",
      "shop=findash-shipping-4.myshopify.com",
      "logged_in_customer_id=",
      "path_prefix=%2Fapps%2Fcheckout-upsell",
      "timestamp=1317327555",
    ].join("&");
    const signature = createHmac("sha256", SECRET)
      .update(appProxySignatureMessage(searchWithoutSignature))
      .digest("hex");
    const search = `${searchWithoutSignature}&signature=${signature}`;

    expect(appProxySignatureMessage(search)).toContain(
      "shop=attacker.myshopify.com,findash-shipping-4.myshopify.com",
    );
    expect(shopFromAppProxyQuery(search, SECRET, NOW)).toBe(
      "findash-shipping-4.myshopify.com",
    );
  });

  it("rejects a bad signature and a stale timestamp", () => {
    expect(appProxySignatureMatches(LOGGED_IN.replace(/signature=[a-f0-9]+/, "signature=" + "ab".repeat(32)), SECRET, NOW)).toBe(false);
    expect(appProxySignatureMatches(LOGGED_IN, SECRET, NOW + 91)).toBe(false);
    expect(shopFromAppProxyQuery(LOGGED_IN, SECRET, NOW)).toBeNull();
  });
});
