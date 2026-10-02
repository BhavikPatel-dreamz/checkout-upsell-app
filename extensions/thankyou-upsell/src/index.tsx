import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { type EligibleOffer, loadEligibleOffers, postOfferEvent } from "./offersApi";

export default async function extension() {
  const result = await loadEligibleOffers({
    placement: "post_purchase",
    displayLocation: "thank_you_page",
  });
  for (const offer of result.offers) {
    void postOfferEvent("viewed", offer, { placement: "post_purchase" });
  }
  render(
    <ThankYouUpsellBlock offers={result.offers} debug={result.debug} shopDomain={result.shopDomain} />,
    document.body,
  );
}

function numericIdFromGid(gid: string): string | null {
  const match = gid.match(/(\d+)\s*$/);
  return match ? match[1] : null;
}

function ThankYouUpsellBlock({
  offers,
  debug,
  shopDomain,
}: {
  offers: EligibleOffer[];
  debug: string;
  shopDomain: string;
}) {
  const settings = (shopify.settings.value ?? {}) as {
    heading_text?: string;
    button_label?: string;
    use_secondary_button?: boolean;
  };
  const headingText = settings.heading_text || "You may also like";
  const buttonLabel = settings.button_label || "Order";
  const buttonVariant = settings.use_secondary_button === true ? "secondary" : "primary";

  if (offers.length === 0) {
    return (
      <s-banner heading="Dynamic Dreamz Upsell" tone="warning">
        {debug || "No thank-you offer matched."}
      </s-banner>
    );
  }

  return (
    <s-stack direction="block" gap="base">
      <s-heading>{headingText}</s-heading>
      <s-stack direction="inline" gap="base">
        {offers.map((offer) => (
          <s-box key={`${offer.offerId}-${offer.variantId}`} padding="base" border="base" borderRadius="base">
            <s-stack direction="block" gap="base">
              {offer.imageUrl ? (
                <s-image src={offer.imageUrl} alt={offer.productTitle} />
              ) : (
                <s-box padding="large" background="subdued" />
              )}
              <s-text>{offer.productTitle}</s-text>
              {offer.price ? <s-text tone="neutral">${offer.price}</s-text> : null}
              <AcceptButton
                offer={offer}
                shopDomain={shopDomain}
                buttonLabel={buttonLabel}
                buttonVariant={buttonVariant}
              />
            </s-stack>
          </s-box>
        ))}
      </s-stack>
    </s-stack>
  );
}

function AcceptButton({
  offer,
  shopDomain,
  buttonLabel,
  buttonVariant,
}: {
  offer: EligibleOffer;
  shopDomain: string;
  buttonLabel: string;
  buttonVariant: "primary" | "secondary";
}) {
  const [href, setHref] = useState<string | undefined>(undefined);

  useEffect(() => {
    const variantId = numericIdFromGid(offer.variantId);
    if (!variantId || !shopDomain) return;
    const params = new URLSearchParams({
      id: variantId,
      quantity: "1",
      return_to: "/checkout",
    });
    params.set("properties[_upsell_offer_id]", offer.offerId);
    setHref(`https://${shopDomain}/cart/add?${params.toString()}`);
  }, [offer, shopDomain]);

  return (
    <s-button
      variant={buttonVariant}
      href={href}
      disabled={!href}
      onClick={() => {
        void postOfferEvent("clicked", offer, { placement: "post_purchase" });
        void postOfferEvent("added-to-cart", offer, { placement: "post_purchase" });
      }}
    >
      {buttonLabel}
    </s-button>
  );
}
