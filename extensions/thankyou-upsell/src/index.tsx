import {
  reactExtension,
  useApi,
  Image,
  Text,
  View,
  BlockStack,
  InlineLayout,
  ScrollView,
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

    const buildAcceptUrl = useCallback((selectedOffer: EligibleOffer): string | null => {
    const shopDomain = getShopDomain();
    if (!shopDomain) return null;

    const upsellVariantId = Number(selectedOffer.variantId.replace("gid://shopify/ProductVariant/", ""));
    if (!upsellVariantId) return null;

    const { customerId, guestKey } = getCustomerIdentity();
    const properties: Record<string, string> = {
      _upsell_offer_id: selectedOffer.offerId,
      _upsell_product_id: selectedOffer.productId,
      _upsell_variant_id: selectedOffer.variantId,
      _upsell_customer_id: customerId ?? "",
      _upsell_guest_key: guestKey ?? "",
    };

    // Cart permalinks require line item properties as a single `properties`
    // param containing Base64 URL-encoded JSON — not properties[key]=value
    // pairs. See: https://shopify.dev/docs/apps/build/checkout/create-cart-permalinks
    const filteredProps = Object.fromEntries(
      Object.entries(properties).filter(([, value]) => value !== ""),
    );
    const json = JSON.stringify(filteredProps);
    const base64 = btoa(unescape(encodeURIComponent(json)));
    const base64Url = base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    return `https://${shopDomain}/cart/${upsellVariantId}:1?checkout&properties=${base64Url}`;
  }, [getShopDomain, getCustomerIdentity]);

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
      <Text emphasis="bold" size="medium">
        You may also like
      </Text>

      <ScrollView direction="inline">
        <InlineLayout
          spacing="base"
          blockAlignment="start"
          columns={offers.map(() => 180)}
        >
          {offers.map((o) => (
            <View
              key={`${o.offerId}-${o.variantId}`}
              minBlockSize={330}
              maxBlockSize={330}
              overflow="hidden"
              border="base"
              borderRadius="base"
              padding="base"
            >
              <BlockStack spacing="tight">
                <View
                  minInlineSize={136}
                  maxInlineSize={136}
                  minBlockSize={136}
                  maxBlockSize={136}
                  cornerRadius="base"
                >
                  {o.imageUrl ? (
                    <Image
                      source={o.imageUrl}
                      accessibilityDescription={o.productTitle}
                      fit="cover"
                      cornerRadius="base"
                    />
                  ) : (
                    <View
                      minInlineSize={136}
                      maxInlineSize={136}
                      minBlockSize={136}
                      maxBlockSize={136}
                      background="subdued"
                      cornerRadius="base"
                    />
                  )}
                </View>

                <View minBlockSize={96} maxBlockSize={96} overflow="hidden">
                  <BlockStack spacing="extraTight" inlineAlignment="start">
                    {o.promotionalTitle && (
                      <Text emphasis="bold" size="small" appearance="subdued">
                        {o.promotionalTitle}
                      </Text>
                    )}
                    <Text emphasis="bold" size="small">
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
                </View>

                <View minBlockSize={84} maxBlockSize={84} overflow="hidden">
                  <InlineLayout spacing="extraTight" columns={["fill", "fill"]}>
                    <Button
                      kind="primary"
                      to={buildAcceptUrl(o) ?? undefined}
                      onPress={() => handleAccept(o)}
                      disabled={processing}
                      accessibilityLabel="Add this item to your order"
                    >
                      Order
                    </Button>

                    <Button
                      kind="secondary"
                      onPress={handleDismiss}
                      disabled={processing}
                      accessibilityLabel="Decline this offer"
                    >
                      No thanks
                    </Button>
                  </InlineLayout>
                </View>
              </BlockStack>
            </View>
          ))}
        </InlineLayout>
      </ScrollView>
    </BlockStack>
  );
}
