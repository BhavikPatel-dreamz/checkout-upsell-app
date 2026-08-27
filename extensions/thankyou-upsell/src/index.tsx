import {
  reactExtension,
  useApi,
  Image,
  Text,
  View,
  BlockStack,
  InlineStack,
  Button,
} from "@shopify/ui-extensions-react/checkout";
import { useState, useEffect, useCallback } from "react";

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

export default reactExtension(
  "purchase.thank-you.block.render",
  () => <ThankYouUpsellBlock />,
);

function ThankYouUpsellBlock() {
  const api = useApi();
  const [offers, setOffers] = useState<EligibleOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const getShopDomain = useCallback((): string | null => {
    const s = api.shop as unknown as Record<string, unknown> | undefined;
    if (s && typeof s.myshopifyDomain === "string") return s.myshopifyDomain;
    if (s && typeof s.name === "string") return s.name;
    return null;
  }, [api]);

  const buildAcceptUrl = useCallback((selectedOffer: EligibleOffer): string | null => {
    const shopDomain = getShopDomain();
    if (!shopDomain) return null;

    // Build the checkout URL for the UPSELL variant the buyer clicked on —
    // not the items from the order they already placed.
    const upsellVariantId = Number(selectedOffer.variantId.replace("gid://shopify/ProductVariant/", ""));
    if (!upsellVariantId) return null;

    return `https://${shopDomain}/cart/${upsellVariantId}:1?checkout`;
  }, [getShopDomain]);

  const getCustomerIdentity = useCallback((): { customerId: string | null; guestKey: string | null } => {
    const apiRecord = api as unknown as Record<string, unknown>;
    const customer = apiRecord.customer as Record<string, unknown> | undefined;
    const customerId =
      customer &&
      (typeof customer.id === "string" || typeof customer.id === "number")
        ? String(customer.id)
        : null;

    if (customerId) return { customerId, guestKey: null };

    try {
      if (typeof window !== "undefined" && window?.sessionStorage) {
        const stored = window.sessionStorage.getItem("checkout-upsell-guest-key");
        if (stored) return { customerId: null, guestKey: stored };
        const next = `guest-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
        try { window.sessionStorage.setItem("checkout-upsell-guest-key", next); } catch {}
        return { customerId: null, guestKey: next };
      }
      return { customerId: null, guestKey: `guest-${Date.now()}-${Math.random().toString(16).slice(2)}` };
    } catch {
      return { customerId: null, guestKey: `guest-${Date.now()}-${Math.random().toString(16).slice(2)}` };
    }
  }, [api]);

  const trackClick = useCallback(async (shopDomain: string, clickedOffer: EligibleOffer) => {
    const { customerId, guestKey } = getCustomerIdentity();
    try {
      await fetch(`https://${shopDomain}/apps/checkout-upsell/api/offers/clicked`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop: shopDomain,
          offerId: clickedOffer.offerId,
          offerName: clickedOffer.offerName,
          productId: clickedOffer.productId,
          variantId: clickedOffer.variantId,
          placement: "post_purchase",
          customerId,
          guestKey,
          isGuest: !customerId,
        }),
      });
    } catch (err) {
      console.error("ThankYou upsell click tracking error:", err);
    }
  }, [getCustomerIdentity]);

  const trackAddedToCart = useCallback(async (shopDomain: string, addedOffer: EligibleOffer) => {
    const { customerId, guestKey } = getCustomerIdentity();
    try {
      await fetch(`https://${shopDomain}/apps/checkout-upsell/api/offers/added-to-cart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop: shopDomain,
          offerId: addedOffer.offerId,
          offerName: addedOffer.offerName,
          productId: addedOffer.productId,
          variantId: addedOffer.variantId,
          placement: "post_purchase",
          customerId,
          guestKey,
          isGuest: !customerId,
        }),
      });
    } catch (err) {
      console.error("ThankYou upsell added-to-cart tracking error:", err);
    }
  }, [getCustomerIdentity]);


  const handleAccept = useCallback(async (selectedOffer: EligibleOffer) => {
    if (!selectedOffer || processing) return;
    const shopDomain = getShopDomain();
    if (!shopDomain) return;

    setProcessing(true);
    void trackClick(shopDomain, selectedOffer);
    void trackAddedToCart(shopDomain, selectedOffer);
    setProcessing(false);
  }, [processing, getShopDomain, trackClick, trackAddedToCart]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const apiRecord = api as unknown as Record<string, unknown>;

    async function trackViewed(shopDomain: string, visibleOffer: EligibleOffer) {
      const { customerId, guestKey } = getCustomerIdentity();
      try {
        await fetch(`https://${shopDomain}/apps/checkout-upsell/api/offers/viewed`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shop: shopDomain,
            offerId: visibleOffer.offerId,
            offerName: visibleOffer.offerName,
            productId: visibleOffer.productId,
            variantId: visibleOffer.variantId,
            placement: "post_purchase",
            customerId,
            guestKey,
            isGuest: !customerId,
          }),
        });
      } catch (err) {
        console.error("ThankYou upsell impression tracking error:", err);
      }
    }

    async function fetchOffer() {
      try {
        const shopObj = apiRecord.shop as Record<string, unknown> | undefined;
        const shop = (shopObj && typeof shopObj.myshopifyDomain === "string")
          ? shopObj.myshopifyDomain
          : undefined;
        if (!shop) { setLoading(false); return; }

        const rawLines = apiRecord.lines;
        const linesCandidate = (rawLines && typeof rawLines === "object" && "current" in (rawLines as Record<string, unknown>))
          ? (rawLines as Record<string, unknown>).current
          : rawLines;
        const lines: Array<Record<string, unknown>> = Array.isArray(linesCandidate) ? linesCandidate : [];

        const productIds = lines
          .map((l) => {
            const merchandise = l.merchandise as Record<string, unknown> | undefined;
            const product = merchandise?.product as Record<string, unknown> | undefined;
            return product?.id as string | undefined;
          })
          .filter(Boolean) as string[];
        const variantIds = lines
          .map((l) => {
            const merchandise = l.merchandise as Record<string, unknown> | undefined;
            return merchandise?.id as string | undefined;
          })
          .filter(Boolean) as string[];

        if (productIds.length === 0 && variantIds.length === 0) {
          setLoading(false);
          return;
        }

        const params = new URLSearchParams({
          shop,
          placement: "post_purchase",
          productIds: productIds.join(","),
          variantIds: variantIds.join(","),
        });

        const proxyUrl = `https://${shop}/apps/checkout-upsell/api/offers/eligible`;
        const res = await fetch(`${proxyUrl}?${params.toString()}`);
        if (!res.ok) { setLoading(false); return; }

        const data = await res.json() as { offers?: EligibleOffer[] };
        if (!cancelled && data?.offers && data.offers.length > 0) {
          setOffers(data.offers);
          for (const v of data.offers) void trackViewed(shop, v);
        }
      } catch (err) {
        console.error("ThankYou upsell fetch error:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchOffer();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

    if (loading || offers.length === 0 || dismissed) return null;

  return (
    <BlockStack spacing="tight" padding={["base", "none"]}>
      <BlockStack
        spacing="tight"
        padding="base"
        border="base"
        borderRadius="base"
        borderColor="secondary"
        maxInlineSize={400}
      >
        <Text emphasis="bold" size="medium">
          You may also like
        </Text>

        {offers.map((o) => (
          <BlockStack key={o.offerId} spacing="tight" padding={"none"}>
            <InlineStack spacing="base" blockAlignment="start">
              {o.imageUrl && (
                <View maxInlineSize={96} minInlineSize={96}>
                  <Image
                    source={o.imageUrl}
                    alt={o.productTitle}
                    aspectRatio={1}
                    cornerRadius="base"
                    fit="cover"
                  />
                </View>
              )}

              <BlockStack spacing="extraTight" inlineAlignment="start">
                {o.promotionalTitle && (
                  <Text emphasis="bold" size="small" appearance="subdued">
                    {o.promotionalTitle}
                  </Text>
                )}
                <Text emphasis="strong" size="small">
                  {o.productTitle}
                </Text>
                {o.variantTitle && (
                  <Text size="small" appearance="subdued">
                    {o.variantTitle}
                  </Text>
                )}
                {o.price && (
                  <Text size="small" appearance="subdued">
                    ${o.price}
                  </Text>
                )}
              </BlockStack>
            </InlineStack>

            <InlineStack spacing="tight" blockAlignment="center">
              <Button
                kind="primary"
                to={buildAcceptUrl(o) ?? undefined}
                onPress={() => handleAccept(o)}
                disabled={processing}
                accessibilityLabel="Order only"
              >
                Order only
              </Button>

              <Button
                kind="tertiary"
                onPress={handleDismiss}
                disabled={processing}
                accessibilityLabel="Decline this offer"
              >
                No thanks
              </Button>
            </InlineStack>
          </BlockStack>
        ))}
      </BlockStack>
    </BlockStack>
  );
}
