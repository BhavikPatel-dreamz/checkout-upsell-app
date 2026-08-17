// Offer data-access + validation. All reads/writes are scoped to a shop.
// Keep this the only place that talks to Prisma for offers (see AGENTS.md).

import { Prisma, OfferType, OfferPlacement } from "@prisma/client";
import db from "../db.server";

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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
    return null;
  }
  return value as string[];
}

/** Validate a create payload. `shop` is never taken from the body — only the session. */
export function validateCreateOffer(
  body: unknown,
): ValidationResult<OfferCreateInput> {
  const errors: Record<string, string> = {};
  const b = (isPlainObject(body) ? body : {}) as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) errors.name = "Name is required.";

  if (!OFFER_TYPES.includes(b.type as OfferType)) {
    errors.type = `Type must be one of: ${OFFER_TYPES.join(", ")}.`;
  }

  if (!OFFER_PLACEMENTS.includes(b.placement as OfferPlacement)) {
    errors.placement = `Placement must be one of: ${OFFER_PLACEMENTS.join(", ")}.`;
  }

  const targetProductIds = asStringArray(b.targetProductIds);
  if (targetProductIds === null) {
    errors.targetProductIds = "targetProductIds must be an array of strings.";
  }

  if (
    b.triggerRules !== undefined &&
    b.triggerRules !== null &&
    !isPlainObject(b.triggerRules)
  ) {
    errors.triggerRules = "triggerRules must be an object.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      name,
      type: b.type as OfferType,
      placement: b.placement as OfferPlacement,
      targetProductIds: targetProductIds ?? [],
      triggerRules: isPlainObject(b.triggerRules)
        ? (b.triggerRules as Prisma.InputJsonValue)
        : undefined,
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

  if (b.name !== undefined) {
    const name = typeof b.name === "string" ? b.name.trim() : "";
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
      data.targetProductIds = arr;
    }
  }

  if (b.triggerRules !== undefined) {
    if (b.triggerRules === null) {
      data.triggerRules = Prisma.JsonNull;
    } else if (!isPlainObject(b.triggerRules)) {
      errors.triggerRules = "triggerRules must be an object.";
    } else {
      data.triggerRules = b.triggerRules as Prisma.InputJsonValue;
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

export function createOffer(shop: string, input: OfferCreateInput) {
  return db.offer.create({
    data: {
      shop,
      name: input.name,
      type: input.type,
      placement: input.placement,
      targetProductIds: input.targetProductIds,
      isActive: input.isActive,
      ...(input.triggerRules !== undefined
        ? { triggerRules: input.triggerRules }
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
