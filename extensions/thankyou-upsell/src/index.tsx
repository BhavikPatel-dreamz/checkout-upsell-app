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

    async function fetchOffer() {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const shop = (api as Record<string, unknown>).shop as string | undefined;
        if (!shop) { setLoading(false); return; }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lines = ((api as Record<string, unknown>).lines ?? []) as Array<Record<string, unknown>>;
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
          setOffer(data.offers[0]);
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
