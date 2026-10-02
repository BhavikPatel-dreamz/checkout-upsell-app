import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useState, useEffect, useCallback, useMemo } from "preact/hooks";
import {
  useShop,
  useCartLines,
  useStorage,
  useSettings,
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
const DISMISS_STORAGE_KEY = "checkout-upsell-thankyou-dismissed";

export default async () => {
  render(<ThankYouUpsellBlock />, document.body);
};

function numericIdFromGid(gid: string): string | null {
  const match = gid.match(/(\d+)\s*$/);
  return match ? match[1] : null;
}

function ThankYouUpsellBlock() {
  const shop = useShop();
  const shopDomain = shop.myshopifyDomain;
  const settings = useSettings() as {
    api_base?: string;
    heading_text?: string;
    button_label?: string;
    use_secondary_button?: boolean;
    price_standard_appearance?: boolean;
    card_spacing?: string;
    show_border?: boolean;
  };
  const lines = useCartLines();
  const api = useApi();
  const customer = api.buyerIdentity?.customer?.value;
  const storage = useStorage();

  const headingText = settings.heading_text || "You may also like";
  const buttonLabel = settings.button_label || "Order";
  const buttonVariant = settings.use_secondary_button === true ? "secondary" : "primary";
  const priceTone = settings.price_standard_appearance === true ? "auto" : "neutral";
  const rawSpacing = settings.card_spacing?.trim().toLowerCase();
  const cardGap = rawSpacing === "base" || rawSpacing === "loose" ? rawSpacing : "small";
  const showBorder = settings.show_border !== false;

  const [offers, setOffers] = useState<EligibleOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [debugNote, setDebugNote] = useState("Loading thank-you upsell…");

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

  const buildAcceptUrl = useCallback(
    async (selectedOffer: EligibleOffer): Promise<string | null> => {
      if (!shopDomain) return null;
      const upsellVariantId = numericIdFromGid(selectedOffer.variantId);
      if (!upsellVariantId) return null;

      const { customerId, guestKey } = await getCustomerIdentity();
      const params = new URLSearchParams({
        id: upsellVariantId,
        quantity: "1",
        return_to: "/checkout",
      });
      params.set("properties[_upsell_offer_id]", selectedOffer.offerId);
      params.set("properties[_upsell_product_id]", selectedOffer.productId);
      params.set("properties[_upsell_variant_id]", selectedOffer.variantId);
      if (customerId) params.set("properties[_upsell_customer_id]", customerId);
      if (guestKey) params.set("properties[_upsell_guest_key]", guestKey);

      return `https://${shopDomain}/cart/add?${params.toString()}`;
    },
    [shopDomain, getCustomerIdentity],
  );

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
            placement: "post_purchase",
            customerId,
            guestKey,
            isGuest: !customerId,
          }),
        });
      } catch (err) {
        console.error(`ThankYou upsell ${path} tracking error:`, err);
      }
    },
    [shopDomain, getCustomerIdentity, settings],
  );

  const handleAccept = useCallback(
    async (selectedOffer: EligibleOffer) => {
      if (!selectedOffer || processing || !shopDomain) return;
      setProcessing(true);
      try {
        const acceptUrl = await buildAcceptUrl(selectedOffer);
        void trackEvent("clicked", selectedOffer);
        if (acceptUrl) {
          void trackEvent("added-to-cart", selectedOffer);
        }
      } finally {
        setProcessing(false);
      }
    },
    [processing, shopDomain, buildAcceptUrl, trackEvent],
  );

  useEffect(() => {
    let cancelled = false;
    void storage.read(DISMISS_STORAGE_KEY).then((value) => {
      if (!cancelled && value === true) setDismissed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);

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
      const log = (...args: unknown[]) => console.info("[DD Upsell thankyou]", ...args);
      try {
        log("start", {
          shopDomain,
          apiBaseSetting: settings.api_base || "(blank → production)",
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
          log("stop: order has no product/variant ids");
          setDebugNote("Thank you has no line items. Complete a real order with the trigger product.");
          setLoading(false);
          return;
        }

        const { customerId, guestKey } = await getCustomerIdentity();
        const params = new URLSearchParams({
          shop: shopDomain,
          placement: "post_purchase",
          displayLocation: "thank_you_page",
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
          log("stop: zero matching offers (need Active Cross-sell, Thank you display, trigger in the order)");
          setDebugNote(
            `API 200 but 0 offers. Shop ${shopDomain}. Need an Active Cross-sell with Display = Thank you and this order’s product as trigger.`,
          );
        }
      } catch (err) {
        console.error("[DD Upsell thankyou] fetch error", err);
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

  if (dismissed) return null;
  if (loading || offers.length === 0) {
    return (
      <s-banner heading="Dynamic Dreamz Upsell" tone="warning">
        {debugNote}
      </s-banner>
    );
  }

  return (
    <s-stack direction="block" gap="base">
      <s-heading>{headingText}</s-heading>
      <s-scroll-box>
        <s-stack direction="inline" gap="base">
          {offers.map((o) => (
            <s-box
              key={`${o.offerId}-${o.variantId}`}
              padding="base"
              border={showBorder ? "base" : "none"}
              borderRadius="base"
            >
              <s-stack direction="block" gap={cardGap}>
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
                  {o.price ? <s-text tone={priceTone}>${o.price}</s-text> : null}
                </s-stack>
                <AcceptButton
                  offer={o}
                  processing={processing}
                  buildAcceptUrl={buildAcceptUrl}
                  onAccept={handleAccept}
                  buttonLabel={buttonLabel}
                  buttonVariant={buttonVariant}
                />
              </s-stack>
            </s-box>
          ))}
        </s-stack>
      </s-scroll-box>
    </s-stack>
  );
}

function AcceptButton({
  offer,
  processing,
  buildAcceptUrl,
  onAccept,
  buttonLabel,
  buttonVariant,
}: {
  offer: EligibleOffer;
  processing: boolean;
  buildAcceptUrl: (offer: EligibleOffer) => Promise<string | null>;
  onAccept: (offer: EligibleOffer) => void;
  buttonLabel: string;
  buttonVariant: "primary" | "secondary";
}) {
  const [href, setHref] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void buildAcceptUrl(offer).then((url) => {
      if (!cancelled) setHref(url ?? undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [offer, buildAcceptUrl]);

  return (
    <s-button
      variant={buttonVariant}
      href={href}
      disabled={processing || !href}
      onClick={() => onAccept(offer)}
    >
      {buttonLabel}
    </s-button>
  );
}
