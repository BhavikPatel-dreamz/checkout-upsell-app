/* eslint-disable */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { OfferType, PrismaClient } from "@prisma/client";
import {
  buildOfferPayload,
  validateCreateOffer,
  validateUpdateOffer,
  listOffers,
} from "../app/models/offer.server";
import {
  validateOfferFields,
  getOfferValidationSchema,
} from "../app/validation/offerSchemas";
import {
  OFFER_TYPE_CONFIG,
  offerTypeOptions,
  normalizeOfferType,
  isOfferType,
} from "../app/config/offerTypes";

const db = new PrismaClient();

const sample = {
  title: "Test Offer",
  upsellType: "pre-purchase",
  type: undefined as OfferType | undefined,
  showUpsell: "always",
  conditions: [],
  displayOnCheckout: true,
  upsellProduct: "manual",
  manualSelections: [{ productId: "gid://shopify/Product/1", variantId: "gid://shopify/ProductVariant/1" }],
  offerType: "free",
  discountValue: null,
  activeFrom: "2026-08-01",
  activeTo: "2026-08-31",
  promotionalTitle: "Promo",
};

describe("centralized offer type config", () => {
  it("covers every canonical OfferType with label + default placement + fields", () => {
    for (const t of Object.values(OfferType)) {
      const cfg = OFFER_TYPE_CONFIG[t as OfferType];
      expect(cfg?.label).toBeTruthy();
      expect(cfg?.defaultPlacement).toBeTruthy();
      expect(cfg.fields.length).toBeGreaterThan(0);
    }
    expect(offerTypeOptions().length).toBe(Object.values(OfferType).length);
  });

  it("normalizes unknown values to cross_sell and validates known ones", () => {
    expect(isOfferType("cross_sell")).toBe(true);
    expect(isOfferType("post")).toBe(false);
    expect(normalizeOfferType("nope")).toBe(OfferType.cross_sell);
    expect(normalizeOfferType("free_gift")).toBe(OfferType.free_gift);
  });
});

describe("type-aware build + validation", () => {
  it("builds a payload for every offer type preserving type and trigger rules", () => {
    for (const t of Object.values(OfferType)) {
      const type = t as OfferType;
      const built = buildOfferPayload({ ...sample, type });
      expect(built.type).toBe(type);
      expect((built.triggerRules as any)?.offerType).toBe("free");
      const result = validateCreateOffer(built);
      expect(result.ok).toBe(true);
    }
  });

  it("rejects invalid type-specific payloads for every type", () => {
    for (const t of Object.values(OfferType)) {
      const type = t as OfferType;
      expect(validateOfferFields({ ...sample, type, title: "" }, type).title).toBe("Title is required");
      expect(
        validateOfferFields({ ...sample, type, offerType: "discount", discountValue: null }, type).offerType
      ).toBe("Enter a discount percentage");
      expect(validateOfferFields({ ...sample, type, offerType: "" }, type).offerType).toBe("Select an offer type");
      expect(
        validateOfferFields({ ...sample, type, upsellProduct: "manual", manualSelections: [] }, type).upsellProduct
      ).toBe("Add at least one product");
    }
  });

  it("requires at least one trigger product for cross-sell offers", () => {
    const result = validateCreateOffer({
      name: "No Trigger Offer",
      type: OfferType.cross_sell,
      placement: "checkout" as any,
      targetProductIds: [],
      triggerRules: {
        upsellProduct: "manual",
        manualSelections: [{ productId: "gid://shopify/Product/1", variantId: "gid://shopify/ProductVariant/1" }],
      },
      isActive: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.targetProductIds).toBe("Select at least one trigger product.");
    }
  });

  it("limits manual upsell selections to five products", () => {
    const items = Array.from({ length: 6 }, (_, index) => ({
      productId: `gid://shopify/Product/${index + 1}`,
      variantId: `gid://shopify/ProductVariant/${index + 1}`,
    }));

    const result = validateOfferFields({
      ...sample,
      type: OfferType.cross_sell,
      targetProductIds: ["gid://shopify/Product/99"],
      upsellProduct: "manual",
      manualSelections: items,
    }, OfferType.cross_sell);

    expect(result.upsellProduct).toBe("Select up to 5 products.");
  });

  it("returns a working per-type schema via getOfferValidationSchema", () => {
    const schema = getOfferValidationSchema(OfferType.cross_sell);
    expect(Object.keys(schema({ ...sample, title: "" }, "title")).length).toBeGreaterThan(0);
  });

  it("still accepts a partial status-only PATCH", () => {
    const patch = validateUpdateOffer({ isActive: false });
    expect(patch.ok).toBe(true);
    if (patch.ok) expect(patch.data.isActive).toBe(false);
  });

  it("defaults legacy payloads without a type to cross_sell", () => {
    const legacy = buildOfferPayload({ ...sample, type: undefined });
    expect(legacy.type).toBe(OfferType.cross_sell);
  });
});

describe("existing offers remain usable", () => {
  it("maps existing records to configured canonical types", async () => {
    const offers = await listOffers("findash-shipping-12.myshopify.com");
    expect(offers.length).toBeGreaterThan(0);
    for (const o of offers) {
      expect(isOfferType(o.type)).toBe(true);
      expect(OFFER_TYPE_CONFIG[o.type].label).toBeTruthy();
      expect(o.triggerRules).toBeTruthy();
    }
  });
});