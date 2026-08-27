import {
  reactExtension,
  useShop,
  useCartLines,
  useCustomer,
  useStorage,
  Image,
  Text,
  View,
  BlockStack,
  InlineLayout,
  ScrollView,
  Button,
} from "@shopify/ui-extensions-react/checkout";
import { useState, useEffect, useCallback, useMemo } from "react";

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

export default reactExtension(
  "purchase.thank-you.block.render",
  () => <ThankYouUpsellBlock />,
);

function numericIdFromGid(gid: string): string | null {
  const match = gid.match(/(\d+)\s*$/);
  return match ? match[1] : null;
}

function ThankYouUpsellBlock() {
  const shop = useShop();
  const shopDomain = shop.myshopifyDomain;
  const lines = useCartLines();
  const customer = useCustomer();
  const storage = useStorage();
  const [offers, setOffers] = useState<EligibleOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [dismissed, setDismissed] = useState(false);

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
        await fetch(`https://${shopDomain}/apps/checkout-upsell/api/offers/${path}`, {
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
    [shopDomain, getCustomerIdentity],
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

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    void storage.write(DISMISS_STORAGE_KEY, true);
  }, [storage]);

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
      try {
        if (!shopDomain) {
          setLoading(false);
          return;
        }

        if (lineIds.productIds.length === 0 && lineIds.variantIds.length === 0) {
          setLoading(false);
          return;
        }

        const { customerId, guestKey } = await getCustomerIdentity();
        const params = new URLSearchParams({
          shop: shopDomain,
          placement: "post_purchase",
          productIds: lineIds.productIds.join(","),
          variantIds: lineIds.variantIds.join(","),
        });
        if (customerId) params.set("customerId", customerId);
        if (guestKey) params.set("guestKey", guestKey);

        const res = await fetch(
          `https://${shopDomain}/apps/checkout-upsell/api/offers/eligible?${params.toString()}`,
        );
        if (!res.ok) {
          setLoading(false);
          return;
        }

        const data = (await res.json()) as { offers?: EligibleOffer[] };
        if (!cancelled && data?.offers && data.offers.length > 0) {
          setOffers(data.offers);
          for (const offer of data.offers) void trackEvent("viewed", offer);
        }
      } catch (err) {
        console.error("ThankYou upsell fetch error:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchOffer();
    return () => {
      cancelled = true;
    };
  }, [shopDomain, lineIds, trackEvent, getCustomerIdentity]);

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
                    <AcceptButton
                      offer={o}
                      processing={processing}
                      buildAcceptUrl={buildAcceptUrl}
                      onAccept={handleAccept}
                    />

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

function AcceptButton({
  offer,
  processing,
  buildAcceptUrl,
  onAccept,
}: {
  offer: EligibleOffer;
  processing: boolean;
  buildAcceptUrl: (offer: EligibleOffer) => Promise<string | null>;
  onAccept: (offer: EligibleOffer) => void;
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
    <Button
      kind="primary"
      to={href}
      onPress={() => onAccept(offer)}
      disabled={processing || !href}
      accessibilityLabel="Add this item to your order"
    >
      Order
    </Button>
  );
}
