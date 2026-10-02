import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useState } from "preact/hooks";
import { type EligibleOffer, loadEligibleOffers, postOfferEvent } from "./offersApi";

export default async function extension() {
  const result = await loadEligibleOffers({
    placement: "checkout",
    displayLocation: "checkout_page",
  });
  for (const offer of result.offers) {
    void postOfferEvent("viewed", offer, { placement: "checkout" });
  }
  render(<CheckoutUpsellBlock offers={result.offers} debug={result.debug} />, document.body);
}

function CheckoutUpsellBlock({
  offers,
  debug,
}: {
  offers: EligibleOffer[];
  debug: string;
}) {
  const [processing, setProcessing] = useState(false);

  async function handleAccept(offer: EligibleOffer) {
    if (processing) return;
    setProcessing(true);
    try {
      void postOfferEvent("clicked", offer, { placement: "checkout" });
      const result = await shopify.applyCartLinesChange({
        type: "addCartLine",
        merchandiseId: offer.variantId,
        quantity: 1,
        attributes: [
          { key: "_upsell_offer_id", value: offer.offerId },
          { key: "upsell_offer_id", value: offer.offerId },
        ],
      });
      if (result.type === "error") {
        console.error("[DD Upsell] addCartLine", result.message);
        return;
      }
      void postOfferEvent("added-to-cart", offer, { placement: "checkout" });
    } finally {
      setProcessing(false);
    }
  }

  if (offers.length === 0) {
    return (
      <s-banner heading="Dynamic Dreamz Upsell" tone="warning">
        {debug || "No checkout offer matched."}
      </s-banner>
    );
  }

  return (
    <s-stack direction="block" gap="base">
      <s-heading>You may also like</s-heading>
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
              <s-button variant="primary" disabled={processing} onClick={() => handleAccept(offer)}>
                Add
              </s-button>
            </s-stack>
          </s-box>
        ))}
      </s-stack>
    </s-stack>
  );
}
