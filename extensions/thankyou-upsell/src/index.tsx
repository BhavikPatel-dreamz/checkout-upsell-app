import {
  reactExtension,
  useApi,
  Image,
  Text,
  BlockStack,
  InlineStack,
  Button,
} from "@shopify/ui-extensions-react/checkout";
import { useState, useEffect } from "react";

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
  const [offer, setOffer] = useState<EligibleOffer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const apiRecord = api as unknown as Record<string, unknown>;

    async function trackViewed(shopDomain: string, visibleOffer: EligibleOffer) {
      try {
        const customer = apiRecord.customer as Record<string, unknown> | undefined;
        const customerId =
          customer && (typeof customer.id === "string" || typeof customer.id === "number")
            ? String(customer.id)
            : null;
        const guestKey = customerId ? null : (() => {
          try {
            const stored = window.sessionStorage.getItem("checkout-upsell-guest-key");
            if (stored) return stored;
            const next = `guest-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
            window.sessionStorage.setItem("checkout-upsell-guest-key", next);
            return next;
          } catch {
            return `guest-${Date.now()}-${Math.random().toString(16).slice(2)}`;
          }
        })();

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
        const shop = apiRecord.shop as string | undefined;
        if (!shop) { setLoading(false); return; }

        const lines = ((apiRecord.lines ?? []) as Array<Record<string, unknown>>);
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
          const visibleOffer = data.offers[0];
          setOffer(visibleOffer);
          void trackViewed(shop, visibleOffer);
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

  if (loading || !offer) return null;

  return (
    <BlockStack spacing="tight" padding={["base", "none"]}>
      <BlockStack
        spacing="base"
        padding="base"
        border="base"
        borderRadius="base"
        borderColor="secondary"
      >
        <Text emphasis="bold" size="medium">
          You may also like
        </Text>

        <InlineStack spacing="base" blockAlignment="start">
          {offer.imageUrl && (
            <Image
              source={offer.imageUrl}
              alt={offer.productTitle}
              maxWidth="80px"
              aspectRatio={1}
              cornerRadius="base"
            />
          )}

          <BlockStack spacing="tight">
            {offer.promotionalTitle && (
              <Text emphasis="bold" size="small" appearance="subdued">
                {offer.promotionalTitle}
              </Text>
            )}
            <Text emphasis="strong" size="small">
              {offer.productTitle}
            </Text>
            {offer.variantTitle && (
              <Text size="small" appearance="subdued">
                {offer.variantTitle}
              </Text>
            )}
            <Text size="small" appearance="subdued">
              ${offer.price}
            </Text>

            <Button
              kind="primary"
              disabled={true}
              accessibilityLabel="Add to order - coming soon"
            >
              Add to order
            </Button>
          </BlockStack>
        </InlineStack>
      </BlockStack>
    </BlockStack>
  );
}
