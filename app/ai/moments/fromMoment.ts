/**
 * Prefill the unified OfferForm from a Smart Moment (AI-6.3).
 * Create still goes through createOffer → wrapOfferAsCampaign (draft).
 */

export function momentOfferFormPath(momentId: string): string {
  const id = momentId.trim();
  const params = new URLSearchParams({
    offerType: "cross_sell",
    placement: "product_page",
    momentId: id,
  });
  return `/app/offers/new?${params.toString()}`;
}

export function momentOfferEditPath(offerId: string): string {
  return `/app/offers/new?id=${encodeURIComponent(offerId.trim())}`;
}

export function offerDraftFromSmartMoment(input: {
  id: string;
  kind: string;
  productId: string;
  relatedProductId: string;
  explanation: string;
  lift?: number;
  expectedImpact?: number;
  relatedVariantId?: string | null;
  relatedVariantTitle?: string | null;
  triggerTitle?: string | null;
  relatedTitle?: string | null;
}) {
  const variantId = input.relatedVariantId?.trim() || input.relatedProductId;
  return {
    title: `Smart Moment ${input.kind.replace(/_/g, " ")}`.trim(),
    showUpsell: "always",
    conditions: [{ field: "", operator: "", value: "" }],
    displayLocation: "product_page",
    upsellProduct: "manual",
    triggerProductIds: [input.productId],
    manualSelections: [
      {
        productId: input.relatedProductId,
        productTitle: input.relatedTitle ?? "",
        variantId,
        variantTitle: input.relatedVariantTitle ?? "",
      },
    ],
    offerType: "as-is",
    discountValue: "",
    activeFrom: "",
    activeTo: "",
    promotionalTitle: input.explanation,
    isActive: false,
    smartMomentId: input.id,
  };
}
