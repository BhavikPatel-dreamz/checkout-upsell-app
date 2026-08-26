/**
 * Type-aware offer validation.
 *
 * The unified offer form and the backend (route action + JSON API) share one
 * validation core keyed by the canonical offer type. Field-level checks that
 * are common to every type live here too, so the create/edit actions and the
 * API do not each maintain their own copy.
 */

import type { OfferType } from "@prisma/client";

import { getOfferTypeConfig } from "../config/offerTypes";

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: Record<string, string> };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Read a field that may be present either at the top level of the payload or
 * nested inside `triggerRules` (the shape produced by `buildOfferPayload`).
 */
function fieldValue(
  body: Record<string, unknown>,
  key: string,
): unknown {
  if (body[key] !== undefined) return body[key];
  const triggerRules = isPlainObject(body.triggerRules) ? body.triggerRules : {};
  return triggerRules[key];
}

function stringValue(body: Record<string, unknown>, key: string): string {
  const value = fieldValue(body, key);
  return typeof value === "string" ? value : "";
}

function hasNonEmptyArray(body: Record<string, unknown>, key: string): boolean {
  const value = fieldValue(body, key);
  return Array.isArray(value) && value.length > 0;
}

/**
 * Whether a field's inputs are present in the payload at all. The unified form
 * always submits every field (as empty strings when untouched), while the JSON
 * API only sends configured fields — so requiredness is only enforced when the
 * field is present. Structural requirements (e.g. name on create) are enforced
 * by the model layer.
 */
function isPresent(body: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((key) => fieldValue(body, key) !== undefined);
}

/**
 * Validate the fields rendered by the unified form for a given offer type.
 * Returns a map of field-name → error message (empty when valid). `nameKey`
 * controls the error key used for the title/name field so the form action can
 * surface it under `title` while the JSON API surfaces it under `name`.
 */
export function validateOfferFields(
  body: Record<string, unknown>,
  offerType: OfferType,
  nameKey = "title",
): Record<string, string> {
  const errors: Record<string, string> = {};
  const config = getOfferTypeConfig(offerType);

  if (isPresent(body, ["name", "title"])) {
    const name = stringValue(body, "name") || stringValue(body, "title");
    if (!name.trim()) errors[nameKey] = "Title is required";
  }

  if (config.fields.includes("showUpsell") && isPresent(body, ["showUpsell"])) {
    const showUpsell = stringValue(body, "showUpsell");
    if (!showUpsell) errors.showUpsell = "Select when to show the upsell";
    if (showUpsell === "condition" && !hasNonEmptyArray(body, "conditions")) {
      errors.showUpsell = "Add at least one condition";
    }
  }

  if (
    config.fields.includes("displayLocation") &&
    isPresent(body, ["displayLocation"])
  ) {
    const displayLocation = stringValue(body, "displayLocation");
    if (!displayLocation) {
      errors.displayLocation = "Select where to display the upsell";
    }
  }

  if (config.fields.includes("upsellProduct") && isPresent(body, ["upsellProduct"])) {
    const upsellProduct = stringValue(body, "upsellProduct");
    if (!upsellProduct) {
      errors.upsellProduct = "Select how the upsell product is chosen";
    }
    if (upsellProduct === "manual") {
      const manual = Array.isArray(fieldValue(body, "manualSelections")) ? fieldValue(body, "manualSelections") as unknown[] : [];
      if (manual.length === 0) {
        errors.upsellProduct = "Add at least one product";
      } else if (manual.length > 5) {
        errors.upsellProduct = "Select up to 5 products.";
      }
    }
  }

  if (offerType === "cross_sell") {
    const targetIds = Array.isArray(fieldValue(body, "targetProductIds"))
      ? (fieldValue(body, "targetProductIds") as unknown[])
      : [];
    const normalizedTargetIds = targetIds.filter((value) => typeof value === "string" && value.trim().length > 0);
    if (normalizedTargetIds.length === 0) {
      errors.targetProductIds = "Select at least one trigger product.";
    }
  }

  if (config.fields.includes("dealType") && isPresent(body, ["offerType"])) {
    const dealType = stringValue(body, "offerType");
    if (!dealType) errors.offerType = "Select an offer type";
    const discountValue = fieldValue(body, "discountValue");
    if (
      dealType === "discount" &&
      (discountValue === undefined ||
        discountValue === null ||
        discountValue === "" ||
        Number.isNaN(Number(discountValue)))
    ) {
      errors.offerType = "Enter a discount percentage";
    }
  }

  if (
    config.fields.includes("promotionalTitle") &&
    isPresent(body, ["promotionalTitle"])
  ) {
    const promotionalTitle = stringValue(body, "promotionalTitle").trim();
    if (!promotionalTitle) errors.promotionalTitle = "Promotional title is required";
  }

  return errors;
}

/**
 * Return a validation function for a specific offer type. Enables callers to
 * validate a payload against the exact fields the unified form renders for
 * that type.
 */
export function getOfferValidationSchema(offerType: OfferType) {
  return (body: Record<string, unknown>, nameKey?: string) =>
    validateOfferFields(body, offerType, nameKey);
}