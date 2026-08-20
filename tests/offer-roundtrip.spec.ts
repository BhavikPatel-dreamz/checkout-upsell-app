/* eslint-disable */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { OfferType, OfferPlacement, PrismaClient } from "@prisma/client";
import {
  buildOfferPayload,
  createOffer,
  getOffer,
  updateOffer,
  deleteOffer,
  validateCreateOffer,
} from "../app/models/offer.server";

const db = new PrismaClient();
const SHOP = "findash-shipping-12.myshopify.com";

describe("unified offer create → read → update → delete round-trip", () => {
  let createdId: string;

  it("builds + validates the unified form payload", () => {
    const built = buildOfferPayload({
      title: "E2E Unified Offer",
      upsellType: "post-purchase",
      placement: OfferPlacement.post_purchase,
      type: OfferType.cross_sell,
      showUpsell: "always",
      conditions: [],
      displayOnCheckout: true,
      displayLocation: "thank_you_page",
      upsellProduct: "manual",
      manualSelections: [
        {
          productId: "gid://shopify/Product/7965255041205",
          variantId: "gid://shopify/ProductVariant/44478092542133",
        },
      ],
      offerType: "discount",
      discountValue: 15,
      activeFrom: "2026-08-01",
      activeTo: "2026-09-01",
      promotionalTitle: "E2E Promo",
    });

    expect(built.type).toBe(OfferType.cross_sell);
    expect(built.placement).toBe(OfferPlacement.post_purchase);
    expect((built.triggerRules as any)?.displayLocation).toBe("thank_you_page");
    expect((built.triggerRules as any)?.offerType).toBe("discount");

    const validated = validateCreateOffer(built);
    expect(validated.ok).toBe(true);
  });

  it("creates, reads, updates, and deletes an offer", async () => {
    const built = buildOfferPayload({
      title: "E2E Unified Offer",
      upsellType: "post-purchase",
      placement: OfferPlacement.post_purchase,
      type: OfferType.cross_sell,
      showUpsell: "always",
      conditions: [],
      displayOnCheckout: true,
      displayLocation: "thank_you_page",
      upsellProduct: "manual",
      manualSelections: [
        {
          productId: "gid://shopify/Product/7965255041205",
          variantId: "gid://shopify/ProductVariant/44478092542133",
        },
      ],
      offerType: "discount",
      discountValue: 15,
      activeFrom: "2026-08-01",
      activeTo: "2026-09-01",
      promotionalTitle: "E2E Promo",
    });

    const created = await createOffer(SHOP, built);
    expect(created.id).toBeTruthy();
    createdId = created.id;

    const fetched = await getOffer(SHOP, created.id);
    expect(fetched?.type).toBe(OfferType.cross_sell);
    expect(fetched?.placement).toBe(OfferPlacement.post_purchase);
    const rules = (fetched?.triggerRules as Record<string, unknown>) ?? {};
    expect(rules.offerType).toBe("discount");
    expect(rules.displayLocation).toBe("thank_you_page");
    expect(rules.promotionalTitle).toBe("E2E Promo");

    const updated = await updateOffer(SHOP, created.id, {
      name: "E2E Unified Offer (updated)",
      type: OfferType.bundle,
      placement: OfferPlacement.checkout,
    });
    expect(updated?.name).toBe("E2E Unified Offer (updated)");
    expect(updated?.type).toBe(OfferType.bundle);
    expect(updated?.placement).toBe(OfferPlacement.checkout);
  });

  it("deletes the created offer", async () => {
    if (!createdId) return;
    const deleted = await deleteOffer(SHOP, createdId);
    expect(deleted).toBe(true);
    const gone = await getOffer(SHOP, createdId);
    expect(gone).toBeNull();
  });
});