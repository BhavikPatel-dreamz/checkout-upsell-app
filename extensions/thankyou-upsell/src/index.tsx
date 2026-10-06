import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
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
    buttonLabel: settings.button_label?.trim() || "Order",
    buttonVariant: settings.use_secondary_button === true ? "secondary" : "primary",
    priceTone: settings.price_standard_appearance === true ? undefined : ("neutral" as const),
    cardSpacing,
    showBorder: settings.show_border !== false,
    editorPreviewEnabled: settings.show_editor_preview !== false,
    editorPreviewMessage: settings.editor_preview_message?.trim() || "",
  };
}

export default async function extension() {
  const result = await loadEligibleOffers({
    placement: "post_purchase",
    displayLocation: "thank_you_page",
  });

  const styles = readStyleSettings();
  const inEditor = isCheckoutEditor();
  const previewOnly = result.offers.length === 0 && inEditor && styles.editorPreviewEnabled;
  if (result.offers.length === 0 && !previewOnly) {
    return;
  }

  for (const offer of result.offers) {
    void postOfferEvent("viewed", offer, { placement: "post_purchase" });
  }

  render(
    <ThankYouUpsellBlock
      offers={result.offers}
      debug={result.debug}
      shopDomain={result.shopDomain}
      previewOnly={previewOnly}
      styles={styles}
    />,
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
  previewOnly,
  styles,
}: {
  offers: EligibleOffer[];
  debug: string;
  shopDomain: string;
  previewOnly: boolean;
  styles: ReturnType<typeof readStyleSettings>;
}) {
  const displayOffers = previewOnly ? PREVIEW_OFFERS : offers;

  return (
    <s-stack direction="block" gap="base">
      {previewOnly ? (
        <s-banner heading="Editor preview" tone="warning">
          {styles.editorPreviewMessage ||
            debug ||
            "No thank-you offer matches this order. Create an active Thank You offer and include a trigger product from the order. Sample cards below are preview-only."}
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
                <AcceptButton
                  offer={offer}
                  shopDomain={shopDomain}
                  buttonLabel={styles.buttonLabel}
                  buttonVariant={styles.buttonVariant}
                />
              )}
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
