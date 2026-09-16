import {
  reactExtension,
  useShop,
  useCartLines,
  useCustomer,
  useStorage,
  useApplyCartLinesChange,
  Image,
  Text,
  View,
  BlockStack,
  InlineLayout,
  ScrollView,
  Button,
  useSettings,
} from "@shopify/ui-extensions-react/checkout";
import { useState, useEffect, useCallback, useMemo } from "react";
import { offersApiUrl, emitAiEvents } from "./offersApi";

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

export default reactExtension(
  "purchase.checkout.block.render",
  () => <CheckoutUpsellBlock />,
);

function CheckoutUpsellBlock() {
  const shop = useShop();
  const shopDomain = shop.myshopifyDomain;
  const settings = useSettings() as { api_base?: string };
  const lines = useCartLines();
  const customer = useCustomer();
  const storage = useStorage();
  const applyCartLinesChange = useApplyCartLinesChange();
  const [offers, setOffers] = useState<EligibleOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

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
      const name =
        path === "viewed"
          ? "recommendation_view"
          : path === "clicked"
            ? "recommendation_click"
            : "recommendation_add";
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
        await emitAiEvents(
          shopDomain,
          settings,
          [
            {
              name,
              customerId,
              sessionId: guestKey,
              anonId: guestKey,
              surface: "checkout_ui",
              source: "checkout_upsell",
              entities: { productId: offer.productId, variantId: offer.variantId },
              attribution: { recommendationId: offer.offerId, campaignId: offer.offerId },
            },
            ...(path === "added-to-cart"
              ? [
                  {
                    name: "add_to_cart",
                    customerId,
                    sessionId: guestKey,
                    anonId: guestKey,
                    surface: "checkout_ui",
                    source: "checkout_upsell",
                    entities: { productId: offer.productId, variantId: offer.variantId },
                  },
                ]
              : []),
          ],
          true,
        );
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
          placement: "checkout",
          displayLocation: "checkout_page",
          productIds: lineIds.productIds.join(","),
          variantIds: lineIds.variantIds.join(","),
        });
        if (customerId) params.set("customerId", customerId);
        if (guestKey) params.set("guestKey", guestKey);

        const res = await fetch(
          `${offersApiUrl("eligible", settings)}?${params.toString()}`,
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
        console.error("Checkout upsell fetch error:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchOffer();
    return () => {
      cancelled = true;
    };
  }, [shopDomain, lineIds, trackEvent, getCustomerIdentity, settings]);

  if (loading || offers.length === 0) return null;

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
                  <Button
                    kind="primary"
                    onPress={() => handleAccept(o)}
                    disabled={processing}
                    accessibilityLabel="Add this item to checkout"
                  >
                    Add
                  </Button>
                </View>
              </BlockStack>
            </View>
          ))}
        </InlineLayout>
      </ScrollView>
    </BlockStack>
  );
}
