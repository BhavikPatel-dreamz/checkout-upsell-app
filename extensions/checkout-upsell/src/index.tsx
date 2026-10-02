import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useState, useEffect, useCallback, useMemo } from "preact/hooks";
import {
  useShop,
  useCartLines,
  useStorage,
  useApplyCartLinesChange,
  useSettings,
  useExtensionEditor,
  useApi,
} from "@shopify/ui-extensions/checkout/preact";
import { offersApiUrl } from "./offersApi";

interface EligibleOffer {
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

const GUEST_STORAGE_KEY = "checkout-upsell-guest-key";

export default async () => {
  render(<CheckoutUpsellBlock />, document.body);
};

function CheckoutUpsellBlock() {
  const shop = useShop();
  const shopDomain = shop.myshopifyDomain;
  const isEditor = Boolean(useExtensionEditor());
  const settings = useSettings() as { api_base?: string };
  const lines = useCartLines();
  const api = useApi();
  const customer = api.buyerIdentity?.customer?.value;
  const storage = useStorage();
  const applyCartLinesChange = useApplyCartLinesChange();
  const [offers, setOffers] = useState<EligibleOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [debugNote, setDebugNote] = useState("Loading upsell…");

  const getCustomerIdentity = useCallback(async (): Promise<{
    customerId: string | null;
    guestKey: string | null;
  }> => {
    const customerId = customer?.id ?? null;
    if (customerId) return { customerId, guestKey: null };

    try {
      const stored = await storage.read(GUEST_STORAGE_KEY);
      if (typeof stored === "string" && stored) {
        return { customerId: null, guestKey: stored };
      }
      const next = `guest-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      await storage.write(GUEST_STORAGE_KEY, next);
      return { customerId: null, guestKey: next };
    } catch {
      return {
        customerId: null,
        guestKey: `guest-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      };
    }
  }, [customer, storage]);

  const trackEvent = useCallback(
    async (path: "clicked" | "added-to-cart" | "viewed", offer: EligibleOffer) => {
      const { customerId, guestKey } = await getCustomerIdentity();
      try {
        await fetch(offersApiUrl(path, settings), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shop: shopDomain,
            offerId: offer.offerId,
            offerName: offer.offerName,
            productId: offer.productId,
            variantId: offer.variantId,
            placement: "checkout",
            customerId,
            guestKey,
            isGuest: !customerId,
          }),
        });
      } catch (err) {
        console.error(`Checkout upsell ${path} tracking error:`, err);
      }
    },
    [shopDomain, getCustomerIdentity, settings],
  );

  const handleAccept = useCallback(
    async (selectedOffer: EligibleOffer) => {
      if (!selectedOffer || processing) return;
      setProcessing(true);
      try {
        const { customerId, guestKey } = await getCustomerIdentity();
        const attributes = [
          { key: "_upsell_offer_id", value: selectedOffer.offerId },
          { key: "upsell_offer_id", value: selectedOffer.offerId },
          { key: "_upsell_product_id", value: selectedOffer.productId },
          { key: "upsell_product_id", value: selectedOffer.productId },
          { key: "_upsell_variant_id", value: selectedOffer.variantId },
          { key: "upsell_variant_id", value: selectedOffer.variantId },
        ];
        if (customerId) {
          attributes.push({ key: "_upsell_customer_id", value: customerId });
          attributes.push({ key: "upsell_customer_id", value: customerId });
        }
        if (guestKey) {
          attributes.push({ key: "_upsell_guest_key", value: guestKey });
          attributes.push({ key: "upsell_guest_key", value: guestKey });
        }

        void trackEvent("clicked", selectedOffer);
        const result = await applyCartLinesChange({
          type: "addCartLine",
          merchandiseId: selectedOffer.variantId,
          quantity: 1,
          attributes,
        });
        if (result.type === "error") {
          console.error("Checkout upsell add error:", result.message);
          return;
        }
        void trackEvent("added-to-cart", selectedOffer);
      } finally {
        setProcessing(false);
      }
    },
    [processing, applyCartLinesChange, getCustomerIdentity, trackEvent],
  );

  const lineIds = useMemo(() => {
    const productIds = (lines ?? [])
      .map((line) => line.merchandise?.product?.id)
      .filter((id): id is string => Boolean(id));
    const variantIds = (lines ?? [])
      .map((line) => line.merchandise?.id)
      .filter((id): id is string => Boolean(id));
    return { productIds, variantIds };
  }, [lines]);

  useEffect(() => {
    let cancelled = false;

    async function fetchOffer() {
      const log = (...args: unknown[]) => console.info("[DD Upsell checkout]", ...args);
      try {
        log("start", {
          shopDomain,
          apiBaseSetting: settings.api_base || "(blank → production)",
          editor: isEditor,
          productIds: lineIds.productIds,
          variantIds: lineIds.variantIds,
        });

        if (!shopDomain) {
          log("stop: no shop domain");
          setDebugNote("No shop domain from Shopify.");
          setLoading(false);
          return;
        }

        if (lineIds.productIds.length === 0 && lineIds.variantIds.length === 0) {
          log("stop: cart has no product/variant ids");
          setDebugNote("Cart has no product IDs yet. Add a trigger product, then reload checkout.");
          setLoading(false);
          return;
        }

        const { customerId, guestKey } = await getCustomerIdentity();
        const params = new URLSearchParams({
          shop: shopDomain,
          placement: "checkout",
          displayLocation: "checkout_page",
          productIds: lineIds.productIds.join(","),
          variantIds: lineIds.variantIds.join(","),
        });
        if (customerId) params.set("customerId", customerId);
        if (guestKey) params.set("guestKey", guestKey);

        const url = `${offersApiUrl("eligible", settings)}?${params.toString()}`;
        log("fetch", url);

        const res = await fetch(url);
        const bodyText = await res.text();
        log("response", { status: res.status, ok: res.ok, body: bodyText.slice(0, 800) });
        if (!res.ok) {
          log("stop: API not ok");
          setDebugNote(`API ${res.status}: ${bodyText.slice(0, 180)}`);
          setLoading(false);
          return;
        }

        const data = JSON.parse(bodyText) as { offers?: EligibleOffer[] };
        const count = data?.offers?.length ?? 0;
        log("offers", count, data?.offers?.map((o) => o.offerName) ?? []);
        if (!cancelled && data?.offers && data.offers.length > 0) {
          setOffers(data.offers);
          for (const offer of data.offers) void trackEvent("viewed", offer);
        } else {
          log("stop: zero matching offers (check trigger product, placement Checkout, offer Active)");
          setDebugNote(
            `API 200 but 0 offers. Shop ${shopDomain}. Products ${lineIds.productIds.length}. Need an Active Cross-sell with Display = Checkout and the cart product as trigger.`,
          );
        }
      } catch (err) {
        console.error("[DD Upsell checkout] fetch error", err);
        setDebugNote(`Fetch failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchOffer();
    return () => {
      cancelled = true;
    };
  }, [shopDomain, lineIds, trackEvent, getCustomerIdentity, settings]);

  if (loading) {
    return <s-banner heading="Dynamic Dreamz Upsell">{debugNote}</s-banner>;
  }

  if (offers.length === 0) {
    return (
      <s-banner heading="Dynamic Dreamz Upsell" tone="warning">
        {debugNote}
      </s-banner>
    );
  }

  return (
    <s-stack direction="block" gap="base">
      <s-heading>You may also like</s-heading>
      <s-scroll-box>
        <s-stack direction="inline" gap="base">
          {offers.map((o) => (
            <s-box key={`${o.offerId}-${o.variantId}`} padding="base" border="base" borderRadius="base">
              <s-stack direction="block" gap="base">
                {o.imageUrl ? (
                  <s-image src={o.imageUrl} alt={o.productTitle} />
                ) : (
                  <s-box padding="large" background="subdued" />
                )}
                <s-stack direction="block" gap="small">
                  {o.promotionalTitle ? (
                    <s-text tone="neutral">{o.promotionalTitle}</s-text>
                  ) : null}
                  <s-text>{o.productTitle}</s-text>
                  {o.variantTitle ? (
                    <s-text tone="neutral">{o.variantTitle}</s-text>
                  ) : null}
                  {o.price ? <s-text tone="neutral">${o.price}</s-text> : null}
                </s-stack>
                <s-button
                  variant="primary"
                  disabled={processing}
                  onClick={() => handleAccept(o)}
                >
                  Add
                </s-button>
              </s-stack>
            </s-box>
          ))}
        </s-stack>
      </s-scroll-box>
    </s-stack>
  );
}
