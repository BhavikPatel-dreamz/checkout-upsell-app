/** Direct app origin — checkout UI runs in a Shopify worker, so app-proxy URLs fail CORS. */
export const DEFAULT_APP_ORIGIN = "https://upsell.dreamzapps.com";

const DEV_ONLY_HOSTS = new Set(["upsale.dynamicdreamz.net", "localhost", "127.0.0.1"]);

export interface EligibleOffer {
  offerId: string;
  offerName: string;
  productId: string;
  variantId: string;
  productTitle: string;
  variantTitle: string | null;
  imageUrl: string | null;
  price: string | null;
  promotionalTitle: string | null;
  offerType: string;
}

function isUsableAppOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    if (DEV_ONLY_HOSTS.has(url.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

export function offersApiOrigin(settings?: { api_base?: string }): string {
  const fromSettings = settings?.api_base?.trim().replace(/\/$/, "");
  if (fromSettings && isUsableAppOrigin(fromSettings)) return fromSettings;
  return DEFAULT_APP_ORIGIN.replace(/\/$/, "");
}

export function offersApiUrl(
  path: "eligible" | "viewed" | "clicked" | "added-to-cart",
  settings?: { api_base?: string },
): string {
  return `${offersApiOrigin(settings)}/api/offers/${path}`;
}

function lineIdsFromCheckout() {
  const lines = shopify.lines.value ?? [];
  const productIds = lines
    .map((line) => line.merchandise?.product?.id)
    .filter((id): id is string => Boolean(id));
  const variantIds = lines
    .map((line) => line.merchandise?.id)
    .filter((id): id is string => Boolean(id));
  return { productIds, variantIds };
}

/** Latest Checkout UI flow: session token + fetch before first paint. */
export async function loadEligibleOffers(input: {
  placement: "checkout" | "post_purchase";
  displayLocation: string;
}): Promise<{ offers: EligibleOffer[]; debug: string; shopDomain: string }> {
  const shopDomain = shopify.shop.myshopifyDomain;
  const settings = (shopify.settings.value ?? {}) as { api_base?: string };
  const { productIds, variantIds } = lineIdsFromCheckout();

  if (!shopDomain) {
    return { offers: [], debug: "No shop domain from shopify.shop", shopDomain: "" };
  }
  if (productIds.length === 0 && variantIds.length === 0) {
    return {
      offers: [],
      debug: "shopify.lines is empty. Add the trigger product to the cart/order.",
      shopDomain,
    };
  }

  const params = new URLSearchParams({
    shop: shopDomain,
    placement: input.placement,
    displayLocation: input.displayLocation,
    productIds: productIds.join(","),
    variantIds: variantIds.join(","),
  });

  const url = `${offersApiUrl("eligible", settings)}?${params.toString()}`;
  try {
    const token = await shopify.sessionToken.get();
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    const bodyText = await res.text();
    console.info("[DD Upsell]", input.placement, res.status, url, bodyText.slice(0, 400));
    if (!res.ok) {
      return {
        offers: [],
        debug: `API ${res.status}: ${bodyText.slice(0, 160)}`,
        shopDomain,
      };
    }
    const data = JSON.parse(bodyText) as { offers?: EligibleOffer[] };
    const offers = data.offers ?? [];
    return {
      offers,
      debug:
        offers.length > 0
          ? ""
          : `API 200, 0 offers for ${shopDomain}. Need Active Cross-sell, matching display, trigger in cart.`,
      shopDomain,
    };
  } catch (error) {
    console.error("[DD Upsell] fetch failed", error);
    return {
      offers: [],
      debug: `Fetch failed: ${error instanceof Error ? error.message : String(error)}`,
      shopDomain,
    };
  }
}

export async function postOfferEvent(
  path: "clicked" | "added-to-cart" | "viewed",
  offer: EligibleOffer,
  extra: Record<string, unknown>,
) {
  const settings = (shopify.settings.value ?? {}) as { api_base?: string };
  try {
    await fetch(offersApiUrl(path, settings), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        shop: shopify.shop.myshopifyDomain,
        offerId: offer.offerId,
        offerName: offer.offerName,
        productId: offer.productId,
        variantId: offer.variantId,
        ...extra,
      }),
    });
  } catch (error) {
    console.error(`[DD Upsell] ${path} tracking error`, error);
  }
}
