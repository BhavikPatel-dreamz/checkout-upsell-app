import type { OfferType } from "@prisma/client";

export const MAX_UPSELL_PRODUCTS = 5;

export interface EligibleOfferPayload {
  offerId: string;
  offerName: string;
  productId: string;
  variantId: string;
  productHandle: string | null;
  productTitle: string;
  variantTitle: string | null;
  imageUrl: string | null;
  price: string | null;
  promotionalTitle?: string | null;
  offerType: OfferType;
  discountValue?: number | null;
}
