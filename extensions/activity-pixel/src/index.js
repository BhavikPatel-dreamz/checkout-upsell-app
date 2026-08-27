import { register } from "@shopify/web-pixels-extension";

const EVENT_TYPES = new Set([
  "product_viewed",
  "collection_viewed",
  "search_submitted",
  "product_added_to_cart",
  "variant_changed",
  "time_on_page",
]);

const GUEST_COOKIE = "checkout-upsell-guest-key";

function toGid(type, value) {
  if (!value) return null;
  const text = String(value);
  if (text.indexOf("gid://") === 0) return text;
  const numeric = text.match(/(\d+)\s*$/);
  if (!numeric) return text;
  return `gid://shopify/${type}/${numeric[1]}`;
}

function myshopifyDomain(init) {
  const shop = init?.data?.shop;
  const domain = shop?.myshopifyDomain || "";
  if (typeof domain === "string" && /\.myshopify\.com$/.test(domain)) return domain;
  return "";
}

register(({ analytics, browser, init, settings }) => {
  const shop = myshopifyDomain(init);
  const apiBase = String(settings?.apiBase || "").replace(/\/$/, "");
  let lastProductView = { productId: null, variantId: null };

  function endpoints() {
    const urls = [];
    if (apiBase) urls.push(`${apiBase}/api/activity`);
    if (shop) urls.push(`https://${shop}/apps/checkout-upsell/api/activity`);
    return urls;
  }

  async function clientIdFromCookie() {
    try {
      const value = await browser.cookie.get("_shopify_y");
      return value || null;
    } catch {
      return null;
    }
  }

  async function guestKeyFromCookie() {
    try {
      const value = await browser.cookie.get(GUEST_COOKIE);
      return value || null;
    } catch {
      return null;
    }
  }

  function customerGid() {
    const id = init?.data?.customer?.id;
    if (!id) return null;
    return toGid("Customer", id);
  }

  async function postActivity(payload) {
    if (!EVENT_TYPES.has(payload.eventType)) return;
    if (!payload.clientId && !payload.customerId && !payload.guestKey) return;
    const urls = endpoints();
    if (urls.length === 0) return;

    const body = JSON.stringify({
      shop,
      consented: true,
      ...payload,
    });

    for (const url of urls) {
      try {
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          keepalive: true,
          body,
        });
        return;
      } catch (error) {
        console.error("Activity pixel post failed:", url, error);
      }
    }
  }

  async function identityFromEvent(event) {
    return {
      clientId: event.clientId || (await clientIdFromCookie()),
      customerId: customerGid(),
      guestKey: customerGid() ? null : await guestKeyFromCookie(),
    };
  }

  analytics.subscribe("product_viewed", async (event) => {
    const variant = event.data?.productVariant;
    const productId = toGid("Product", variant?.product?.id);
    const variantId = toGid("ProductVariant", variant?.id);
    const id = await identityFromEvent(event);
    if (
      lastProductView.productId === productId &&
      lastProductView.variantId &&
      variantId &&
      lastProductView.variantId !== variantId
    ) {
      await postActivity({
        eventType: "variant_changed",
        ...id,
        productId,
        variantId,
        occurredAt: event.timestamp,
      });
    }
    lastProductView = { productId, variantId };
    await postActivity({
      eventType: "product_viewed",
      ...id,
      productId,
      variantId,
      occurredAt: event.timestamp,
    });
  });

  analytics.subscribe("collection_viewed", async (event) => {
    const collection = event.data?.collection;
    const id = await identityFromEvent(event);
    await postActivity({
      eventType: "collection_viewed",
      ...id,
      collectionId: toGid("Collection", collection?.id),
      occurredAt: event.timestamp,
    });
  });

  analytics.subscribe("search_submitted", async (event) => {
    const query = event.data?.searchResult?.query ?? event.data?.query ?? null;
    const id = await identityFromEvent(event);
    await postActivity({
      eventType: "search_submitted",
      ...id,
      query: typeof query === "string" ? query : null,
      occurredAt: event.timestamp,
    });
  });

  analytics.subscribe("product_added_to_cart", async (event) => {
    const merchandise = event.data?.cartLine?.merchandise;
    const id = await identityFromEvent(event);
    await postActivity({
      eventType: "product_added_to_cart",
      ...id,
      productId: toGid("Product", merchandise?.product?.id),
      variantId: toGid("ProductVariant", merchandise?.id),
      occurredAt: event.timestamp,
    });
  });
});
