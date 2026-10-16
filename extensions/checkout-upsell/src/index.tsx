import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useState } from "preact/hooks";
import { type EligibleOffer, loadEligibleOffers, postOfferEvent } from "./offersApi";

type Spacing = "none" | "small-100" | "small" | "base" | "large" | "large-100" | "large-200";

const PREVIEW_OFFERS: EligibleOffer[] = [
  {
    offerId: "preview-1",
    offerName: "Preview",
    productId: "gid://shopify/Product/0",
    variantId: "gid://shopify/ProductVariant/0",
    productTitle: "Sample upsell product",
    variantTitle: "Example variant",
    imageUrl: null,
    price: "19.99",
    promotionalTitle: "Example promotional title",
    offerType: "cross_sell",
  },
  {
    offerId: "preview-2",
    offerName: "Preview",
    productId: "gid://shopify/Product/0",
    variantId: "gid://shopify/ProductVariant/0",
    productTitle: "Another recommended item",
    variantTitle: null,
    imageUrl: null,
    price: "24.00",
    promotionalTitle: null,
    offerType: "cross_sell",
  },
];

function isCheckoutEditor() {
  return shopify.extension.editor?.type === "checkout";
}

function readStyleSettings() {
  const settings = (shopify.settings.value ?? {}) as {
    heading_text?: string;
    button_label?: string;
    use_secondary_button?: boolean;
    price_standard_appearance?: boolean;
    card_spacing?: string;
    show_border?: boolean;
    show_editor_preview?: boolean;
    editor_preview_message?: string;
  };

  const spacingRaw = (settings.card_spacing || "tight").trim().toLowerCase();
  const cardSpacing: Spacing =
    spacingRaw === "base" ? "base" : spacingRaw === "loose" ? "large" : "small";

  return {
    headingText: settings.heading_text?.trim() || "You may also like",
    buttonLabel: settings.button_label?.trim() || "Add",
    buttonVariant: settings.use_secondary_button === true ? "secondary" : "primary",
    priceTone: settings.price_standard_appearance === true ? undefined : ("neutral" as const),
    cardSpacing,
    showBorder: settings.show_border !== false,
    editorPreviewEnabled: settings.show_editor_preview !== false,
    editorPreviewMessage: settings.editor_preview_message?.trim() || "",
  };
}

export default async function extension() {
  let result = await loadEligibleOffers({
    placement: "checkout",
    displayLocation: "checkout_page",
  });
  if (result.offers.length === 0) {
    result = await loadEligibleOffers({
      placement: "post_purchase",
      displayLocation: "thank_you_page",
    });
  }

  const styles = readStyleSettings();
  const inEditor = isCheckoutEditor();
  const previewOnly = result.offers.length === 0 && inEditor && styles.editorPreviewEnabled;
  if (result.offers.length === 0 && !previewOnly) {
    return;
  }

  for (const offer of result.offers) {
    void postOfferEvent("viewed", offer, { placement: "checkout" });
  }

  render(
    <CheckoutUpsellBlock
      offers={result.offers}
      debug={result.debug}
      previewOnly={previewOnly}
      styles={styles}
    />,
    document.body,
  );
}

function CheckoutUpsellBlock({
  offers,
  debug,
  previewOnly,
  styles,
}: {
  offers: EligibleOffer[];
  debug: string;
  previewOnly: boolean;
  styles: ReturnType<typeof readStyleSettings>;
}) {
  const [processing, setProcessing] = useState(false);
  const displayOffers = previewOnly ? PREVIEW_OFFERS : offers;

  async function handleAccept(offer: EligibleOffer) {
    if (processing || previewOnly) return;
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

  return (
    <s-stack direction="block" gap="base">
      {previewOnly ? (
        <s-banner heading="Editor preview" tone="warning">
          {styles.editorPreviewMessage ||
            debug ||
            "No checkout offer matches this cart. Create an active Checkout offer and add a trigger product to the cart. Sample cards below are preview-only."}
        </s-banner>
      ) : null}
      <s-heading>{styles.headingText}</s-heading>
      <s-stack direction="inline" gap={styles.cardSpacing}>
        {displayOffers.map((offer) => (
          <s-box
            key={`${offer.offerId}-${offer.variantId}-${offer.productTitle}`}
            padding="base"
            border={styles.showBorder ? "base" : "none"}
            borderRadius="base"
          >
            <s-stack direction="block" gap={styles.cardSpacing}>
              {offer.imageUrl ? (
                <s-image src={offer.imageUrl} alt={offer.productTitle} />
              ) : (
                <s-box padding="large" background="subdued" />
              )}
              {offer.promotionalTitle ? <s-text>{offer.promotionalTitle}</s-text> : null}
              <s-text>{offer.productTitle}</s-text>
              {offer.variantTitle ? <s-text tone="neutral">{offer.variantTitle}</s-text> : null}
              {offer.price ? (
                <s-text tone={styles.priceTone}>${offer.price}</s-text>
              ) : null}
              {previewOnly ? (
                <s-text tone="neutral">Preview only</s-text>
              ) : (
                <s-button
                  variant={styles.buttonVariant}
                  disabled={processing}
                  onClick={() => handleAccept(offer)}
                >
                  {styles.buttonLabel}
                </s-button>
              )}
            </s-stack>
          </s-box>
        ))}
      </s-stack>
    </s-stack>
  );
}
