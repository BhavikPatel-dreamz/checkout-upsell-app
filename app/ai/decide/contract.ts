import { z } from "zod";

export const DECIDE_SURFACES = [
  "product_page",
  "cart",
  "popup",
  "sidebar",
  "thank_you",
  "checkout",
] as const;

export type DecideSurface = (typeof DECIDE_SURFACES)[number];

export const DECIDE_OFFER_TYPES = ["none", "percent", "bundle", "free_shipping"] as const;

export const decideRequestSchema = z
  .object({
    shop: z.string().regex(/^[a-z0-9-]+\.myshopify\.com$/).optional(),
    surface: z.enum(DECIDE_SURFACES).default("product_page"),
    productIds: z.array(z.string().trim().min(1)).default([]),
    variantIds: z.array(z.string().trim().min(1)).default([]),
    cartProductIds: z.array(z.string().trim().min(1)).default([]),
    customerId: z.string().trim().min(1).optional().nullable(),
    anonId: z.string().trim().min(1).optional().nullable(),
    sessionId: z.string().trim().min(1).optional().nullable(),
    consented: z.boolean().optional(),
  })
  .strict();

export type DecideRequest = z.infer<typeof decideRequestSchema>;

export interface DecideProduct {
  productId: string;
  variantId: string | null;
  strategy: string;
  score: number;
}

export interface DecideResponse {
  show: boolean;
  experience: { channel: DecideSurface; templateId: string };
  products: DecideProduct[];
  offer: { type: (typeof DECIDE_OFFER_TYPES)[number]; value: number | null };
  copy: { headline: string; cta: string };
  recommendationId: string;
  intent: { state: string; purchaseIntent: number };
  holdout: boolean;
}

export function identityKey(input: {
  customerId?: string | null;
  anonId?: string | null;
  sessionId?: string | null;
}): string {
  return input.customerId?.trim() || input.anonId?.trim() || input.sessionId?.trim() || "anon";
}
