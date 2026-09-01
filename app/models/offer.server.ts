// Offer data-access + validation. All reads/writes are scoped to a shop.
// Keep this the only place that talks to Prisma for offers (see AGENTS.md).

import { Prisma, OfferType, OfferPlacement } from "@prisma/client";
import db from "../db.server";
import { getOfferTypeConfig, offerRequiresTriggerProducts } from "../config/offerTypes";
import { validateOfferFields } from "../validation/offerSchemas";

const OFFER_TYPES = Object.values(OfferType);
const OFFER_PLACEMENTS = Object.values(OfferPlacement);

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: Record<string, string> };

export interface OfferCreateInput {
  name: string;
  type: OfferType;
  placement: OfferPlacement;
  targetProductIds: string[];
  triggerRules?: Prisma.InputJsonValue;
  isActive: boolean;
}

export interface OfferFormPayload {
  title?: string;
  name?: string;
  upsellType?: string;
  showUpsell?: string;
  conditions?: Array<{ field?: string; operator?: string; value?: string }>;
  displayOnCheckout?: boolean;
  displayLocation?: string;
  upsellProduct?: string;
  manualSelections?: Array<{
    productId?: string;
    productTitle?: string;
    variantId?: string;
    variantTitle?: string;
  }>;
  offerType?: string;
  discountValue?: number | null;
  activeFrom?: string | null;
  activeTo?: string | null;
  promotionalTitle?: string;
  status?: string;
  type?: OfferType;
  placement?: OfferPlacement;
  /**
   * Trigger product GIDs — the cart products that make the offer eligible.
   * Stored as `Offer.targetProductIds`. Distinct from `manualSelections`,
   * which are the upsell products shown when the offer fires.
   */
  triggerProductIds?: string[];
  targetProductIds?: string[];
  triggerRules?: Prisma.InputJsonValue;
  isActive?: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] | null {
  // undefined/null → null so callers can fall through to their next source.
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
    return null;
  }
  return value as string[];
}

function dedupeStrings(value: string[]) {
  return Array.from(new Set(value.filter(Boolean)));
}

function offerPlacementFromUpsellType(value?: string): OfferPlacement {
  if (value === "post-purchase") return OfferPlacement.post_purchase;
  return OfferPlacement.checkout;
}

function normalizeTriggerRules(input: OfferFormPayload): Record<string, unknown> {
  const triggerRules: Record<string, unknown> = isPlainObject(input.triggerRules)
    ? { ...input.triggerRules }
    : {};

  if (typeof input.upsellType === "string") {
    triggerRules.upsellType = input.upsellType;
  }
  if (typeof input.showUpsell === "string") {
    triggerRules.showUpsell = input.showUpsell;
  }
  if (Array.isArray(input.conditions) && input.conditions.length > 0) {
    triggerRules.conditions = input.conditions;
  }
  if (typeof input.displayOnCheckout === "boolean") {
    triggerRules.displayOnCheckout = input.displayOnCheckout;
  }
  if (typeof input.displayLocation === "string" && input.displayLocation.length > 0) {
    triggerRules.displayLocation = input.displayLocation;
  }
  if (typeof input.upsellProduct === "string") {
    const type = input.type;
    triggerRules.upsellProduct =
      type && getOfferTypeConfig(type).poolOnly ? "manual" : input.upsellProduct;
  }
  if (Array.isArray(input.manualSelections) && input.manualSelections.length > 0) {
    const items = input.manualSelections
      .filter(
        (item): item is { productId: string; variantId: string } =>
          typeof item?.productId === "string" &&
          typeof item?.variantId === "string" &&
          item.productId.length > 0 &&
          item.variantId.length > 0,
      )
      .map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
      }))
      .slice(0, 5);

    if (items.length > 0) {
      triggerRules.manualSelections = items;
      triggerRules.productSelection = {
        mode: input.upsellProduct === "manual" ? "manual" : "related",
        items,
      };
    }
  }
  if (typeof input.offerType === "string") {
    triggerRules.offerType = input.offerType;
  }
  if (typeof input.discountValue === "number") {
    triggerRules.discountValue = input.discountValue;
  } else if (input.discountValue === null || input.discountValue === undefined) {
    // leave undefined unless explicitly set
  }
  if (input.activeFrom || input.activeTo) {
    triggerRules.activeFrom = input.activeFrom ?? null;
    triggerRules.activeTo = input.activeTo ?? null;
  }
  if (typeof input.promotionalTitle === "string") {
    triggerRules.promotionalTitle = input.promotionalTitle;
  }
  if (typeof input.status === "string") {
    triggerRules.status = input.status;
  }

  return triggerRules;
}

export function buildOfferPayload(input: OfferFormPayload): OfferCreateInput {
  const name = (input.name ?? input.title ?? "Untitled upsell").trim() || "Untitled upsell";
  const placement =
    input.placement ??
    offerPlacementFromUpsellType(input.upsellType ?? "pre-purchase");
  const type = input.type ?? OfferType.cross_sell;
  // `targetProductIds` holds the TRIGGER products (cart contents that make the
  // offer eligible). They come from the form's explicit trigger-product picker
  // (`triggerProductIds`) or an explicit `targetProductIds` (JSON API) — never
  // from `manualSelections`, which are the upsell products shown by the offer.
  const normalizedTargetProductIds = dedupeStrings(
    asStringArray(input.targetProductIds) ??
      asStringArray(input.triggerProductIds) ??
      [],
  );

  const triggerRules = normalizeTriggerRules(input);
  const isActive =
    input.isActive ??
    (typeof input.status === "string" ? input.status === "Active" : true);

  return {
    name,
    type,
    placement,
    targetProductIds: normalizedTargetProductIds,
    triggerRules:
      Object.keys(triggerRules).length > 0
        ? (triggerRules as Prisma.InputJsonValue)
        : undefined,
    isActive,
  };
}

/** Validate a create payload. `shop` is never taken from the body — only the session. */
export function validateCreateOffer(
  body: unknown,
): ValidationResult<OfferCreateInput> {
  const errors: Record<string, string> = {};
  const b = (isPlainObject(body) ? body : {}) as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : typeof b.title === "string" ? b.title.trim() : "";
  if (!name) errors.name = "Name is required.";

  const normalizedType =
    (b.type as OfferType | undefined) ??
    (typeof b.offerType === "string" && b.offerType === "discount"
      ? OfferType.cross_sell
      : OfferType.cross_sell);

  if (!OFFER_TYPES.includes(normalizedType)) {
    errors.type = `Type must be one of: ${OFFER_TYPES.join(", ")}.`;
  }

  const normalizedPlacement =
    (b.placement as OfferPlacement | undefined) ??
    (typeof b.upsellType === "string"
      ? offerPlacementFromUpsellType(b.upsellType)
      : OfferPlacement.checkout);

  if (!OFFER_PLACEMENTS.includes(normalizedPlacement)) {
    errors.placement = `Placement must be one of: ${OFFER_PLACEMENTS.join(", ")}.`;
  }

  // Trigger products: explicit `targetProductIds` or the `triggerProductIds`
  // alias. Upsell selections (`manualSelections`) are NOT triggers.
  const targetProductIds =
    asStringArray(b.targetProductIds) ??
    asStringArray(b.triggerProductIds) ??
    [];

  if (offerRequiresTriggerProducts(normalizedType) && targetProductIds.length === 0) {
    errors.targetProductIds = "Select at least one trigger product.";
  }

  if (
    (Array.isArray(b.targetProductIds) &&
      b.targetProductIds.some((value) => typeof value !== "string")) ||
    (Array.isArray(b.triggerProductIds) &&
      b.triggerProductIds.some((value) => typeof value !== "string"))
  ) {
    errors.targetProductIds = "targetProductIds must be an array of strings.";
  }

  if (
    b.triggerRules !== undefined &&
    b.triggerRules !== null &&
    !isPlainObject(b.triggerRules)
  ) {
    errors.triggerRules = "triggerRules must be an object.";
  }

  // Type-aware field validation — the same core the unified form uses.
  // Fields may be nested in triggerRules (the shape buildOfferPayload emits).
  const fieldErrors = validateOfferFields(b, normalizedType, "name");
  for (const [key, message] of Object.entries(fieldErrors)) {
    if (!(key in errors)) errors[key] = message;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const triggerRules = isPlainObject(b.triggerRules)
    ? (b.triggerRules as Prisma.InputJsonValue)
    : undefined;

  return {
    ok: true,
    data: {
      name,
      type: normalizedType,
      placement: normalizedPlacement,
      targetProductIds,
      triggerRules,
      isActive: b.isActive === undefined ? true : Boolean(b.isActive),
    },
  };
}

/** Validate a partial update payload. Only provided fields are touched. */
export function validateUpdateOffer(
  body: unknown,
): ValidationResult<Prisma.OfferUpdateInput> {
  const errors: Record<string, string> = {};
  const b = (isPlainObject(body) ? body : {}) as Record<string, unknown>;
  const data: Prisma.OfferUpdateInput = {};

  if (b.name !== undefined || b.title !== undefined) {
    const name = typeof b.name === "string" ? b.name.trim() : typeof b.title === "string" ? b.title.trim() : "";
    if (!name) errors.name = "Name cannot be empty.";
    else data.name = name;
  }

  if (b.type !== undefined) {
    if (!OFFER_TYPES.includes(b.type as OfferType)) {
      errors.type = `Type must be one of: ${OFFER_TYPES.join(", ")}.`;
    } else {
      data.type = b.type as OfferType;
    }
  }

  if (b.placement !== undefined) {
    if (!OFFER_PLACEMENTS.includes(b.placement as OfferPlacement)) {
      errors.placement = `Placement must be one of: ${OFFER_PLACEMENTS.join(", ")}.`;
    } else {
      data.placement = b.placement as OfferPlacement;
    }
  }

  if (b.targetProductIds !== undefined) {
    const arr = asStringArray(b.targetProductIds);
    if (arr === null) {
      errors.targetProductIds = "targetProductIds must be an array of strings.";
    } else {
      if (
        (b.type === undefined || offerRequiresTriggerProducts(b.type as OfferType)) &&
        arr.length === 0
      ) {
        errors.targetProductIds = "Select at least one trigger product.";
      } else {
        data.targetProductIds = arr;
      }
    }
  }

  if (b.triggerRules !== undefined) {
    if (b.triggerRules === null) {
      data.triggerRules = Prisma.JsonNull;
    } else if (!isPlainObject(b.triggerRules)) {
      errors.triggerRules = "triggerRules must be an object.";
    } else {
      data.triggerRules = b.triggerRules as Prisma.InputJsonValue;

      // A full form update includes triggerRules — validate its fields against
      // the offer's type so partial API updates can't persist malformed type-
      // specific data either.
      const updateType = b.type as OfferType | undefined;
      if (updateType && OFFER_TYPES.includes(updateType)) {
        const fieldErrors = validateOfferFields(b, updateType, "name");
        for (const [key, message] of Object.entries(fieldErrors)) {
          if (!(key in errors)) errors[key] = message;
        }
      }
    }
  }

  if (b.isActive !== undefined) data.isActive = Boolean(b.isActive);

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (Object.keys(data).length === 0) {
    return { ok: false, errors: { _: "No valid fields to update." } };
  }

  return { ok: true, data };
}

export function listOffers(shop: string) {
  return db.offer.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
  });
}

export function getOffer(shop: string, id: string) {
  return db.offer.findFirst({ where: { id, shop } });
}

export function createOffer(shop: string, input: OfferCreateInput | OfferFormPayload) {
  const normalized = buildOfferPayload(
    (input as OfferFormPayload) ?? {},
  );

  return db.offer.create({
    data: {
      shop,
      name: normalized.name,
      type: normalized.type,
      placement: normalized.placement,
      targetProductIds: normalized.targetProductIds,
      isActive: normalized.isActive,
      ...(normalized.triggerRules !== undefined
        ? { triggerRules: normalized.triggerRules }
        : {}),
    },
  });
}

/** Updates only if the offer belongs to `shop`. Returns the row, or null if not found. */
export async function updateOffer(
  shop: string,
  id: string,
  data: Prisma.OfferUpdateInput,
) {
  const result = await db.offer.updateMany({ where: { id, shop }, data });
  if (result.count === 0) return null;
  return db.offer.findFirst({ where: { id, shop } });
}

/** Deletes only if the offer belongs to `shop`. Returns true if a row was removed. */
export async function deleteOffer(shop: string, id: string) {
  const result = await db.offer.deleteMany({ where: { id, shop } });
  return result.count > 0;
}
