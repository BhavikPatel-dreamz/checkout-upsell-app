/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unified offer create / edit form.
 *
 * Renders the correct fields for every offer type (and placement) through a
 * single component. The route passes in the canonical `offerType` (drives
 * which type-specific fields render), the `placement`, and optional initial
 * data when editing. The component owns all local UI state and serialises the
 * form payload.
 *
 * Layout:
 *   OfferForm
 *   ├── CommonOfferFields   (shared by every offer type)
 *   ├── TypeSpecificFields  (driven by OFFER_TYPE_CONFIG[offerType].fields)
 *   └── (OfferActions — rendered by the owning route's form)
 *
 * NOTE ON THE PRODUCT PICKER:
 *   The manual product picker (used for the "Upsell Product" field and for
 *   "Trigger Products") now opens as a Shopify-style "Edit products" modal —
 *   search box + scrollable checkbox list with product image, availability,
 *   and price, with Cancel / Done actions — instead of the old inline
 *   <select> + Add button row. Everything else (state shape, hidden inputs,
 *   submission payload, validation) is unchanged.
 */

import { useState, useEffect } from "react";
import type { OfferPlacement, OfferType } from "@prisma/client";
import {
  placementHeaderLabel,
  displayLocationOptions,
} from "../types/offer";
import {
  DEAL_TYPE_OPTIONS,
  OFFER_TYPE_CONFIG,
  getOfferTypeConfig,
  COMMON_OFFER_FIELDS,
} from "../config/offerTypes";
import { AdminAppLink } from "./AdminAppLink";

// ── Public types ──────────────────────────────────────────────────────

export type Variant = {
  id: string;
  title: string;
  /** Optional — inventory available for this specific variant, shown as "N available". */
  available?: number | null;
  /** Optional — this variant's price, shown right-aligned in the picker. */
  price?: number | string | null;
};
export type Product = {
  id: string;
  title: string;
  image: string | null;
  variants: Variant[];
  /**
   * Optional — fallback inventory used only when a product has a single
   * (default) variant that doesn't carry its own `available`.
   */
  available?: number | null;
  /**
   * Optional — fallback price used only when a product has a single
   * (default) variant that doesn't carry its own `price`.
   */
  price?: number | string | null;
};
export type ErrorMap = Record<string, string>;
export type ConditionRow = { id: string; field: string; operator: string; value: string };
export type ManualSelection = {
  id: string;
  productId: string;
  productTitle: string;
  variantId: string;
  variantTitle: string;
};

export type TriggerSelection = {
  id: string;
  productId: string;
  productTitle: string;
};

export interface OfferInitialData {
  id: string;
  title: string;
  showUpsell: string;
  conditions: Array<{ field: string; operator: string; value: string }>;
  displayLocation: string;
  upsellProduct: string;
  triggerProductIds?: string[];
  manualSelections: Array<{
    productId: string;
    productTitle?: string;
    variantId: string;
    variantTitle?: string;
  }>;
  offerType: string;
  discountValue: string | number;
  activeFrom: string;
  activeTo: string;
  promotionalTitle: string;
  isActive: boolean;
}

export interface OfferFormProps {
  /** create or edit — drives the header copy and submit button label. */
  mode: "create" | "edit";
  /** The canonical offer type. Controls which type-specific fields render. */
  offerType: OfferType;
  /** The canonical placement for this offer. Controls labels + hidden field value. */
  placement: OfferPlacement;
  /** Pre-existing offer data when editing. */
  initialData?: OfferInitialData | null;
  /** Synced product catalog for the manual product picker. */
  products: Product[];
  /** The <fetcher.Form> that owns this component provides the fetcher. */
  fetcherErrors?: ErrorMap;
}

// ── Constants ─────────────────────────────────────────────────────────

const FIELD_OPTIONS = ["Cart Value", "Cart Quantity", "Product Tag", "Customer Tag"];
const OPERATOR_OPTIONS = ["Greater than", "Less than", "Equal to", "Contains"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

let rowIdCounter = 1;
function nextRowId() {
  return `row-${rowIdCounter++}`;
}

function formatPrice(price: number | string | null | undefined): string | null {
  if (price === null || price === undefined || price === "") return null;
  const num = typeof price === "number" ? price : Number(price);
  if (Number.isNaN(num)) return String(price);
  return `₹${num.toFixed(2)}`;
}

// ── Shared form state ─────────────────────────────────────────────────

interface OfferFormState {
  title: string;
  setTitle: (value: string) => void;
  showUpsell: "always" | "condition" | "";
  setShowUpsell: (value: "always" | "condition") => void;
  conditions: ConditionRow[];
  addConditionRow: () => void;
  removeConditionRow: (id: string) => void;
  updateConditionRow: (id: string, patch: Partial<ConditionRow>) => void;
  displayLocation: string;
  setDisplayLocation: (value: string) => void;
  upsellProduct: "manual" | "related" | "";
  setUpsellProduct: (value: "manual" | "related") => void;
  manualSelections: ManualSelection[];
  showProductPicker: boolean;
  openProductPicker: () => void;
  closeProductPicker: () => void;
  applyProductPicker: (selections: ManualSelection[]) => void;
  removeManualSelection: (id: string) => void;
  dealType: "free" | "discount" | "as-is" | "";
  setDealType: (value: "free" | "discount" | "as-is") => void;
  discountValue: string;
  setDiscountValue: (value: string) => void;
  activeFrom: string;
  activeTo: string;
  showDateRange: boolean;
  setShowDateRange: (value: boolean) => void;
  setActiveFrom: (value: string) => void;
  setActiveTo: (value: string) => void;
  promotionalTitle: string;
  setPromotionalTitle: (value: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────

export default function OfferForm({
  offerType,
  placement,
  initialData,
  products,
  fetcherErrors = {},
}: OfferFormProps) {
  const hasSyncedProducts = products.length > 0;
  const upsellTypeValue =
    placement === "post_purchase" ? "post-purchase" : "pre-purchase";
  const locationOptions = displayLocationOptions(placement);
  const typeConfig = getOfferTypeConfig(offerType);
  const typeSpecificFieldIds = typeConfig.fields.filter(
    (fieldId) => !COMMON_OFFER_FIELDS.includes(fieldId),
  );

  // ── Local state ─────────────────────────────────────────────────────
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [showUpsell, setShowUpsell] = useState<"always" | "condition" | "">(
    (initialData?.showUpsell as any) ?? ""
  );
  const [conditions, setConditions] = useState<ConditionRow[]>(
    initialData?.conditions?.length
      ? initialData.conditions.map((row) => ({
          id: nextRowId(),
          field: row.field ?? "",
          operator: row.operator ?? "",
          value: row.value ?? "",
        }))
      : [{ id: nextRowId(), field: "", operator: "", value: "" }]
  );

  const [displayLocation, setDisplayLocation] = useState<string>(
    initialData?.displayLocation ?? locationOptions[0]?.value ?? "checkout_page"
  );

  const [upsellProduct, setUpsellProduct] = useState<"manual" | "related" | "">(
    typeConfig.poolOnly ? "manual" : ((initialData?.upsellProduct as any) ?? "")
  );
  const [manualSelections, setManualSelections] = useState<ManualSelection[]>([]);
  const [triggerSelections, setTriggerSelections] = useState<TriggerSelection[]>([]);

  // Modal open/close state for the two "Edit products" pickers.
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [showTriggerPicker, setShowTriggerPicker] = useState(false);

  useEffect(() => {
    if (!initialData || !Array.isArray(initialData.triggerProductIds)) return;
    if (triggerSelections.length > 0) return;

    const productMap = new Map(products.map((p) => [p.id, p] as const));
    const populated = initialData.triggerProductIds
      .filter((id): id is string => typeof id === "string" && !!id)
      .map((productId, index) => ({
        id: `trigger-${index + 1}`,
        productId,
        productTitle: productMap.get(productId)?.title ?? productId,
      }));

    setTriggerSelections(populated);
  }, [initialData, products, triggerSelections.length]);

  // Populate manualSelections with titles derived from `products` for each saved row.
  useEffect(() => {
    if (
      !initialData ||
      !Array.isArray(initialData.manualSelections) ||
      initialData.manualSelections.length === 0
    )
      return;
    if (manualSelections.length > 0) return;

    const productMap = new Map(products.map((p) => [p.id, p] as const));
    const populated = initialData.manualSelections.map((row: any, index: number) => {
      const productId = typeof row?.productId === "string" ? row.productId : "";
      const variantId = typeof row?.variantId === "string" ? row.variantId : "";
      const product = productMap.get(productId);
      const productTitle =
        product?.title ??
        (typeof row?.productTitle === "string" ? row.productTitle : "");
      const variantTitle =
        product?.variants.find((v) => v.id === variantId)?.title ??
        (typeof row?.variantTitle === "string" ? row.variantTitle : "");

      return {
        id: `row-${index + 1}`,
        productId,
        productTitle,
        variantId,
        variantTitle,
      } as ManualSelection;
    });

    setManualSelections(populated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData, products]);

  // If we have saved manual selections and upsellProduct wasn't explicitly set, default to "manual".
  useEffect(() => {
    if (manualSelections.length > 0) {
      setUpsellProduct((prev) => (prev === "" ? "manual" : prev));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualSelections]);

  const [dealType, setDealType] = useState<"free" | "discount" | "as-is" | "">(
    (initialData?.offerType as any) ?? ""
  );
  const [discountValue, setDiscountValue] = useState(
    String(initialData?.discountValue ?? "")
  );

  const [activeFrom, setActiveFrom] = useState(initialData?.activeFrom ?? "");
  const [activeTo, setActiveTo] = useState(initialData?.activeTo ?? "");
  const [showDateRange, setShowDateRange] = useState(false);

  const [promotionalTitle, setPromotionalTitle] = useState(
    initialData?.promotionalTitle ?? ""
  );

  const errors = fetcherErrors;

  // ── Handlers ────────────────────────────────────────────────────────

  function addConditionRow() {
    setConditions((prev) => [
      ...prev,
      { id: nextRowId(), field: "", operator: "", value: "" },
    ]);
  }
  function removeConditionRow(id: string) {
    setConditions((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  }
  function updateConditionRow(id: string, patch: Partial<ConditionRow>) {
    setConditions((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function selectShowUpsell(value: "always" | "condition") {
    setShowUpsell(value);
  }
  function selectUpsellProduct(value: "manual" | "related") {
    setUpsellProduct(value);
  }
  function selectDealType(value: "free" | "discount" | "as-is") {
    setDealType(value);
  }

  // Applies the set of checked product ids from the "Edit products" modal to
  // triggerSelections: keeps existing rows for products still checked, adds
  // new rows for newly-checked products, drops rows for unchecked ones.
  function applyTriggerPicker(selectedProductIds: string[]) {
    setTriggerSelections((prev) => {
      const productMap = new Map(products.map((p) => [p.id, p] as const));
      const prevByProductId = new Map(prev.map((s) => [s.productId, s] as const));
      return selectedProductIds.map((productId) => {
        const existing = prevByProductId.get(productId);
        if (existing) return existing;
        return {
          id: nextRowId(),
          productId,
          productTitle: productMap.get(productId)?.title ?? productId,
        };
      });
    });
    setShowTriggerPicker(false);
  }

  function removeTriggerSelection(id: string) {
    setTriggerSelections((prev) => prev.filter((item) => item.id !== id));
  }

  // Applies the exact set of selected variants (one row per checked
  // product/variant pair, in tree order) from the "Edit products" modal to
  // manualSelections. Each incoming selection already carries productId,
  // productTitle, variantId, and variantTitle — we just stamp a stable row id
  // on each, reusing the row id of an already-selected variant where possible
  // so unrelated re-renders don't churn keys.
  function applyProductPicker(selections: ManualSelection[]) {
    setManualSelections((prev) => {
      const prevByVariantId = new Map(prev.map((s) => [s.variantId, s] as const));
      return selections.map((sel) => {
        const existing = prevByVariantId.get(sel.variantId);
        return existing ?? { ...sel, id: nextRowId() };
      });
    });
    setUpsellProduct((prev) => (prev === "" ? "manual" : prev));
    setShowProductPicker(false);
  }

  function removeManualSelection(id: string) {
    setManualSelections((prev) => prev.filter((r) => r.id !== id));
  }

  const state: OfferFormState = {
    title,
    setTitle,
    showUpsell,
    setShowUpsell: selectShowUpsell,
    conditions,
    addConditionRow,
    removeConditionRow,
    updateConditionRow,
    displayLocation,
    setDisplayLocation,
    upsellProduct,
    setUpsellProduct: selectUpsellProduct,
    manualSelections,
    showProductPicker,
    openProductPicker: () => setShowProductPicker(true),
    closeProductPicker: () => setShowProductPicker(false),
    applyProductPicker,
    removeManualSelection,
    dealType,
    setDealType: selectDealType,
    discountValue,
    setDiscountValue,
    activeFrom,
    activeTo,
    showDateRange,
    setShowDateRange,
    setActiveFrom,
    setActiveTo,
    promotionalTitle,
    setPromotionalTitle,
  };

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <>
      {/* Hidden fields carried by the parent <fetcher.Form> */}
      <input type="hidden" name="upsellType" value={upsellTypeValue} />
      <input type="hidden" name="placement" value={placement} />
      <input type="hidden" name="type" value={offerType} />
      <input type="hidden" name="conditions" value={JSON.stringify(conditions)} />
      <input type="hidden" name="targetProductIds" value={JSON.stringify(triggerSelections.map((item) => item.productId))} />
      <input type="hidden" name="manualSelections" value={JSON.stringify(manualSelections)} />

      <div style={styles.typeBadgeWrap}>
        <span style={styles.typeBadge}>{OFFER_TYPE_CONFIG[offerType].label}</span>
        <span style={styles.typeBadgeDivider} />
        <span style={styles.typeBadgeSecondary}>{placementHeaderLabel(placement)}</span>
      </div>

      <SectionRow
        title="Basic Information"
        description="Name this offer internally and choose the message and placement shoppers will see."
      >
        <CommonOfferFields state={state} errors={errors} locationOptions={locationOptions} />
      </SectionRow>

      {getOfferTypeConfig(offerType).requiresTriggerProducts && (
        <SectionRow
          title="Trigger Products"
          description="Pick which products in the cart cause this upsell to appear."
        >
          <TriggerProductField
            products={products}
            selected={triggerSelections}
            showPicker={showTriggerPicker}
            onOpenPicker={() => setShowTriggerPicker(true)}
            onClosePicker={() => setShowTriggerPicker(false)}
            onApplyPicker={applyTriggerPicker}
            onRemove={removeTriggerSelection}
            error={errors.targetProductIds}
          />
        </SectionRow>
      )}

      {typeSpecificFieldIds.length > 0 && (
        <SectionRow
          title="Offer Configuration"
          description="Choose what shoppers are offered and, if applicable, the discount to apply."
        >
          {getOfferTypeConfig(offerType).poolOnly && (
            <div style={styles.noticeBox}>
              <span style={styles.noticeIcon}>i</span>
              <span>
                This type uses browse activity to choose which pool product to show. It
                does not create new offers by itself.
              </span>
            </div>
          )}
          <TypeSpecificFields
            state={state}
            errors={errors}
            products={products}
            hasSyncedProducts={hasSyncedProducts}
            fieldIds={typeSpecificFieldIds}
            poolOnly={Boolean(typeConfig.poolOnly)}
          />
        </SectionRow>
      )}

      <SectionRow
        title="Schedule"
        description="Set the window this offer should run in. Leave blank to run indefinitely."
      >
        <DateRangePicker
          activeFrom={state.activeFrom}
          activeTo={state.activeTo}
          open={state.showDateRange}
          onOpen={() => state.setShowDateRange(true)}
          onClose={() => state.setShowDateRange(false)}
          onApply={(from, to) => {
            state.setActiveFrom(from);
            state.setActiveTo(to);
            state.setShowDateRange(false);
          }}
        />
        <input type="hidden" name="activeFrom" value={state.activeFrom} />
        <input type="hidden" name="activeTo" value={state.activeTo} />
      </SectionRow>
    </>
  );
}

// ── Section row (left description, right card — Shopify settings pattern) ──

function SectionRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="of-section-row">
      <div className="of-section-row-left">
        <div style={styles.sectionRowTitle}>{title}</div>
        {description && <div style={styles.sectionRowDesc}>{description}</div>}
      </div>
      <div className="of-section-row-right">
        <div style={styles.card}>{children}</div>
      </div>
    </div>
  );
}

// ── Common offer fields (shared by every offer type) ─────────────────

function CommonOfferFields({
  state,
  errors,
  locationOptions,
}: {
  state: OfferFormState;
  errors: ErrorMap;
  locationOptions: Array<{ value: string; label: string }>;
}) {
  return (
    <>
      {/* Title */}
      <Field label="Title" required error={errors.title}>
        <input
          name="title"
          className="of-input"
          style={styles.input}
          placeholder="e.g. Add a matching case"
          value={state.title}
          onChange={(e) => state.setTitle(e.target.value)}
        />
      </Field>

      {/* Promotional Title */}
      <Field label="Promotional Title" required error={errors.promotionalTitle}>
        <input
          name="promotionalTitle"
          className="of-input"
          style={styles.input}
          placeholder="What shoppers will see, e.g. Complete the look"
          value={state.promotionalTitle}
          onChange={(e) => state.setPromotionalTitle(e.target.value)}
        />
      </Field>

      {/* Show Upsell */}
      <Field label="Show Upsell" required error={errors.showUpsell}>
        <div style={styles.checkRow}>
          <Checkbox
            label="Always"
            checked={state.showUpsell === "always"}
            onClick={() => state.setShowUpsell("always")}
          />
          <Checkbox
            label="Based on Condition"
            checked={state.showUpsell === "condition"}
            onClick={() => state.setShowUpsell("condition")}
          />
        </div>
        <input type="hidden" name="showUpsell" value={state.showUpsell} />

        {state.showUpsell === "condition" && (
          <div style={styles.conditionBox}>
            {state.conditions.map((row, idx) => (
              <div key={row.id} className="of-condition-row" style={styles.conditionRow}>
                <span style={styles.rowBadge}>{idx + 1}</span>
                <select
                  className="of-select"
                  style={styles.select}
                  value={row.field}
                  onChange={(e) => state.updateConditionRow(row.id, { field: e.target.value })}
                >
                  <option value="">Field</option>
                  {FIELD_OPTIONS.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
                <select
                  className="of-select"
                  style={styles.select}
                  value={row.operator}
                  onChange={(e) => state.updateConditionRow(row.id, { operator: e.target.value })}
                >
                  <option value="">Operator</option>
                  {OPERATOR_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
                <input
                  className="of-input"
                  style={styles.conditionValueInput}
                  placeholder="Value"
                  value={row.value}
                  onChange={(e) => state.updateConditionRow(row.id, { value: e.target.value })}
                />
                <button
                  type="button"
                  className="of-round-btn of-round-remove"
                  style={styles.roundButtonRemove}
                  onClick={() => state.removeConditionRow(row.id)}
                  aria-label="Remove condition"
                >
                  −
                </button>
                {idx === state.conditions.length - 1 && (
                  <button
                    type="button"
                    className="of-round-btn of-round-add"
                    style={styles.roundButtonAdd}
                    onClick={state.addConditionRow}
                    aria-label="Add condition"
                  >
                    +
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Field>

      {/* Display Upsell on */}
      <Field label="Display Upsell on" required error={errors.displayLocation} last>
        <div style={styles.checkRow}>
          {locationOptions.map((opt) => {
            const selected = state.displayLocation === opt.value;
            return (
              <label
                key={opt.value}
                className={`of-option-card${selected ? " of-option-card-selected" : ""}`}
                style={{
                  ...styles.optionCard,
                  ...(selected ? styles.optionCardSelected : {}),
                }}
              >
                <input
                  type="radio"
                  name="displayLocation"
                  value={opt.value}
                  checked={selected}
                  onChange={() => state.setDisplayLocation(opt.value)}
                  className="of-visually-hidden-input"
                  style={styles.visuallyHiddenInput}
                />
                <span
                  className={`of-option-check of-option-check-radio${
                    selected ? " of-option-check-selected" : ""
                  }`}
                  style={{
                    ...styles.optionCheckRadio,
                    ...(selected ? styles.optionCheckRadioSelected : {}),
                  }}
                  aria-hidden="true"
                >
                  {selected && <span style={styles.optionRadioDot} />}
                </span>
                <span style={styles.optionCardLabel}>{opt.label}</span>
              </label>
            );
          })}
        </div>
      </Field>
    </>
  );
}

// ── Type-specific fields (driven by the offer type's config) ─────────

function TypeSpecificFields({
  state,
  errors,
  products,
  hasSyncedProducts,
  fieldIds,
  poolOnly,
}: {
  state: OfferFormState;
  errors: ErrorMap;
  products: Product[];
  hasSyncedProducts: boolean;
  fieldIds: string[];
  poolOnly?: boolean;
}) {
  return (
    <>
      {fieldIds.includes("upsellProduct") && (
        <UpsellProductField
          state={state}
          errors={errors}
          products={products}
          hasSyncedProducts={hasSyncedProducts}
          poolOnly={poolOnly}
        />
      )}
      {fieldIds.includes("dealType") && <DealTypeField state={state} errors={errors} />}
    </>
  );
}

function UpsellProductField({
  state,
  errors,
  products,
  hasSyncedProducts,
  poolOnly,
}: {
  state: OfferFormState;
  errors: ErrorMap;
  products: Product[];
  hasSyncedProducts: boolean;
  poolOnly?: boolean;
}) {
  return (
    <Field label={poolOnly ? "Upsell product pool" : "Upsell Product"} required error={errors.upsellProduct}>
      <div style={styles.checkCol}>
        <Checkbox
          label={poolOnly ? "Products AI may recommend (manual pool)" : "Manual selection"}
          checked={state.upsellProduct === "manual"}
          onClick={() => state.setUpsellProduct("manual")}
        />

        {state.upsellProduct === "manual" && (
          <div style={{ marginLeft: 28, marginTop: 4 }}>
            {!hasSyncedProducts ? (
              <div style={styles.emptyNotice}>
                No synced products found. Please sync products first.
              </div>
            ) : (
              <button
                type="button"
                className="of-btn of-btn-secondary"
                style={styles.editProductsButton}
                onClick={state.openProductPicker}
              >
                {state.manualSelections.length > 0 ? "Edit products" : "Select products"}
              </button>
            )}

            {state.manualSelections.length > 0 && (
              <div style={{ ...styles.selectionList, marginLeft: 0 }}>
                {state.manualSelections.map((sel) => {
                  const product = products.find((p) => p.id === sel.productId);
                  return (
                    <div key={sel.id} style={styles.selectionItem}>
                      <span style={styles.selectionItemInner}>
                        <ProductThumb image={product?.image ?? null} size={28} />
                        <span style={styles.selectionItemText}>
                          {sel.productTitle}
                          {sel.variantTitle && sel.variantTitle !== "Default Title"
                            ? ` — ${sel.variantTitle}`
                            : ""}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="of-round-btn of-round-remove"
                        style={styles.roundButtonRemove}
                        onClick={() => state.removeManualSelection(sel.id)}
                        aria-label="Remove product"
                      >
                        −
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {state.showProductPicker && (
              <ProductPickerModal
                mode="variants"
                products={products}
                initialSelectedVariantIds={state.manualSelections.map((s) => s.variantId)}
                onClose={state.closeProductPicker}
                onDoneVariants={state.applyProductPicker}
              />
            )}
          </div>
        )}

        {!poolOnly && (
        <Checkbox
          label="Related Item form shopify based on items in order"
          checked={state.upsellProduct === "related"}
          onClick={() => state.setUpsellProduct("related")}
        />
        )}
      </div>
      <input type="hidden" name="upsellProduct" value={state.upsellProduct} />
    </Field>
  );
}

function TriggerProductField({
  products,
  selected,
  showPicker,
  onOpenPicker,
  onClosePicker,
  onApplyPicker,
  onRemove,
  error,
}: {
  products: Product[];
  selected: TriggerSelection[];
  showPicker: boolean;
  onOpenPicker: () => void;
  onClosePicker: () => void;
  onApplyPicker: (selectedProductIds: string[]) => void;
  onRemove: (id: string) => void;
  error?: string;
}) {
  return (
    <Field label="Main Products" required error={error} last>
      <button
        type="button"
        className="of-btn of-btn-secondary"
        style={{ ...styles.editProductsButton, marginLeft: 0 }}
        onClick={onOpenPicker}
      >
        {selected.length > 0 ? "Edit products" : "Select products"}
      </button>

      {selected.length > 0 && (
        <div style={{ ...styles.selectionList, marginLeft: 0 }}>
          {selected.map((item) => {
            const product = products.find((p) => p.id === item.productId);
            return (
              <div key={item.id} style={styles.selectionItem}>
                <span style={styles.selectionItemInner}>
                  <ProductThumb image={product?.image ?? null} size={28} />
                  <span style={styles.selectionItemText}>{item.productTitle}</span>
                </span>
                <button
                  type="button"
                  className="of-round-btn of-round-remove"
                  style={styles.roundButtonRemove}
                  onClick={() => onRemove(item.id)}
                  aria-label="Remove trigger product"
                >
                  −
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showPicker && (
        <ProductPickerModal
          mode="products"
          products={products}
          initialSelectedProductIds={selected.map((s) => s.productId)}
          onClose={onClosePicker}
          onDoneProducts={onApplyPicker}
        />
      )}
    </Field>
  );
}

function DealTypeField({ state, errors }: { state: OfferFormState; errors: ErrorMap }) {
  return (
    <Field label="Offer on Upsell" required error={errors.offerType} last>
      <div style={styles.checkCol}>
        {DEAL_TYPE_OPTIONS.map((option) => (
          <div key={option.value}>
            <Checkbox
              label={option.label}
              checked={state.dealType === option.value}
              onClick={() => state.setDealType(option.value)}
              noBorder
            />
            {option.value === "discount" && state.dealType === "discount" && (
              <input
                name="discountValue"
                type="number"
                min={0}
                max={100}
                placeholder="e.g. 15"
                className="of-input"
                style={{ ...styles.input, width: 140, marginLeft: 28, marginTop: 8 }}
                value={state.discountValue}
                onChange={(e) => state.setDiscountValue(e.target.value)}
              />
            )}
          </div>
        ))}
      </div>
      <input type="hidden" name="offerType" value={state.dealType} />
    </Field>
  );
}

// ── Product thumbnail (image or placeholder icon) ─────────────────────

function ProductThumb({ image, size = 40 }: { image: string | null; size?: number }) {
  return (
    <span style={{ ...styles.thumb, width: size, height: size }}>
      {image ? (
        <img src={image} alt="" style={styles.thumbImg} loading="lazy" />
      ) : (
        <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="2" y="4" width="20" height="16" rx="2" stroke="#9AA1AC" strokeWidth="1.6" />
          <circle cx="8" cy="10" r="1.7" fill="#9AA1AC" />
          <path d="M4 17L9 12L13 15.5L16 12.5L20 16.5" stroke="#9AA1AC" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

// ── "Edit products" picker modal ───────────────────────────────────────
//
// Shopify-style modal: header + close button, search box, scrollable list,
// and a Cancel / Done footer. Selection is local to the modal until "Done"
// is clicked.
//
// Two modes:
//   - "variants": each product with more than one variant renders as a
//     parent row (tri-state select-all box + thumbnail + title) with its
//     variants listed in an indented tree underneath, each with its own
//     checkbox, "N available", and price — matching the reference "Add
//     product" modal. A product with a single (default) variant renders as
//     one flat, checkbox-led row instead of a parent + child pair. Selection
//     is tracked per-variant and handed back via onDoneVariants as fully
//     resolved { productId, productTitle, variantId, variantTitle } rows.
//   - "products": a flat, single-level list of products (used for pickers
//     that operate on whole products rather than variants, e.g. trigger
//     products). Selection is tracked per-product and handed back via
//     onDoneProducts as an array of product ids.

type ProductPickerModalProps =
  | {
      mode: "variants";
      products: Product[];
      initialSelectedVariantIds: string[];
      onClose: () => void;
      onDoneVariants: (selections: ManualSelection[]) => void;
    }
  | {
      mode: "products";
      products: Product[];
      initialSelectedProductIds: string[];
      onClose: () => void;
      onDoneProducts: (selectedProductIds: string[]) => void;
    };

function ProductPickerModal(props: ProductPickerModalProps) {
  const { mode, products, onClose } = props;
  const [search, setSearch] = useState("");

  const [checkedVariantIds, setCheckedVariantIds] = useState<Set<string>>(
    () => new Set(mode === "variants" ? props.initialSelectedVariantIds : [])
  );
  const [checkedProductIds, setCheckedProductIds] = useState<Set<string>>(
    () => new Set(mode === "products" ? props.initialSelectedProductIds : [])
  );

  const query = search.trim().toLowerCase();
  const filtered = query
    ? products.filter((p) => p.title.toLowerCase().includes(query))
    : products;

  function toggleVariant(variantId: string) {
    setCheckedVariantIds((prev) => {
      const next = new Set(prev);
      if (next.has(variantId)) next.delete(variantId);
      else next.add(variantId);
      return next;
    });
  }

  function toggleAllVariantsForProduct(product: Product) {
    setCheckedVariantIds((prev) => {
      const next = new Set(prev);
      const allChecked = product.variants.every((v) => next.has(v.id));
      product.variants.forEach((v) => {
        if (allChecked) next.delete(v.id);
        else next.add(v.id);
      });
      return next;
    });
  }

  function toggleProduct(productId: string) {
    setCheckedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function handleDone() {
    if (mode === "variants") {
      const selections: ManualSelection[] = [];
      products.forEach((product) => {
        product.variants.forEach((variant) => {
          if (!checkedVariantIds.has(variant.id)) return;
          selections.push({
            id: `${product.id}:${variant.id}`,
            productId: product.id,
            productTitle: product.title,
            variantId: variant.id,
            variantTitle: variant.title,
          });
        });
      });
      props.onDoneVariants(selections);
    } else {
      props.onDoneProducts(Array.from(checkedProductIds));
    }
  }

  const totalCount = filtered.length;
  const selectedCount =
    mode === "variants"
      ? filtered.filter((p) => p.variants.some((v) => checkedVariantIds.has(v.id))).length
      : filtered.filter((p) => checkedProductIds.has(p.id)).length;

  return (
    <div style={styles.modalOverlay} onMouseDown={onClose}>
      <div
        style={styles.modalCard}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Add product"
      >
        <div style={styles.modalHeader}>
          <span style={styles.modalHeaderTitle}>Add product</span>
          <button
            type="button"
            style={styles.modalCloseButton}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div style={styles.modalSearchWrap}>
          <span style={styles.modalSearchIcon} aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="5.2" stroke="#6B7280" strokeWidth="1.5" />
              <path d="M11 11L14.5 14.5" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
          <input
            className="of-input"
            style={styles.modalSearchInput}
            placeholder="Search products"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        <div style={styles.modalList}>
          {filtered.length === 0 && (
            <div style={styles.modalEmptyState}>No products found.</div>
          )}

          {mode === "products" &&
            filtered.map((p) => {
              const isChecked = checkedProductIds.has(p.id);
              const priceLabel = formatPrice(p.price);
              return (
                <label key={p.id} className="of-picker-row" style={styles.modalRow}>
                  <input
                    type="checkbox"
                    className="of-native-checkbox"
                    style={styles.modalCheckbox}
                    checked={isChecked}
                    onChange={() => toggleProduct(p.id)}
                  />
                  <ProductThumb image={p.image} size={36} />
                  <span style={styles.modalRowTitle}>{p.title}</span>
                  {typeof p.available === "number" && (
                    <span style={styles.modalRowMeta}>{p.available} available</span>
                  )}
                  {priceLabel && <span style={styles.modalRowPrice}>{priceLabel}</span>}
                </label>
              );
            })}

          {mode === "variants" &&
            filtered.map((p) => {
              const hasVariantGroup = p.variants.length > 1;

              if (!hasVariantGroup) {
                // Single (default) variant — render as one flat, checkbox-led row.
                const variant = p.variants[0];
                if (!variant) return null;
                const isChecked = checkedVariantIds.has(variant.id);
                const available = variant.available ?? p.available;
                const priceLabel = formatPrice(variant.price ?? p.price);
                return (
                  <label
                    key={p.id}
                    className="of-picker-row"
                    style={{
                      ...styles.modalRow,
                      ...(isChecked ? styles.modalRowSelected : {}),
                    }}
                  >
                    <input
                      type="checkbox"
                      className="of-native-checkbox"
                      style={styles.modalCheckbox}
                      checked={isChecked}
                      onChange={() => toggleVariant(variant.id)}
                    />
                    <ProductThumb image={p.image} size={36} />
                    <span style={styles.modalRowTitle}>{p.title}</span>
                    {typeof available === "number" && (
                      <span style={styles.modalRowMeta}>{available} available</span>
                    )}
                    {priceLabel && <span style={styles.modalRowPrice}>{priceLabel}</span>}
                  </label>
                );
              }

              // Multiple variants — parent row + indented variant tree.
              const checkedCount = p.variants.filter((v) => checkedVariantIds.has(v.id)).length;
              const parentState: "all" | "some" | "none" =
                checkedCount === 0 ? "none" : checkedCount === p.variants.length ? "all" : "some";

              return (
                <div key={p.id} style={styles.modalGroup}>
                  <div style={styles.modalParentRow}>
                    <TriStateBox
                      state={parentState}
                      onClick={() => toggleAllVariantsForProduct(p)}
                      ariaLabel={`Select all variants of ${p.title}`}
                    />
                    <ProductThumb image={p.image} size={32} />
                    <span style={styles.modalParentTitle}>{p.title}</span>
                  </div>

                  {p.variants.map((v) => {
                    const isChecked = checkedVariantIds.has(v.id);
                    const priceLabel = formatPrice(v.price);
                    return (
                      <label
                        key={v.id}
                        className="of-picker-row"
                        style={{
                          ...styles.modalVariantRow,
                          ...(isChecked ? styles.modalRowSelected : {}),
                        }}
                      >
                        <input
                          type="checkbox"
                          className="of-native-checkbox"
                          style={styles.modalCheckbox}
                          checked={isChecked}
                          onChange={() => toggleVariant(v.id)}
                        />
                        <span style={styles.modalVariantTitle}>{v.title}</span>
                        {typeof v.available === "number" && (
                          <span style={styles.modalRowMeta}>{v.available} available</span>
                        )}
                        {priceLabel && <span style={styles.modalRowPrice}>{priceLabel}</span>}
                      </label>
                    );
                  })}
                </div>
              );
            })}
        </div>

        <div style={styles.modalFooter}>
          <span style={styles.modalFooterCount}>
            {selectedCount}/{totalCount} product{totalCount === 1 ? "" : "s"} selected
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              className="of-btn of-btn-secondary"
              style={styles.cancelButton}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="of-btn of-btn-primary"
              style={styles.submitButton}
              onClick={handleDone}
            >
              {mode === "variants" ? "Add" : "Done"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tri-state box (select-all-variants control on a parent product row) ──

function TriStateBox({
  state,
  onClick,
  ariaLabel,
}: {
  state: "all" | "some" | "none";
  onClick: () => void;
  ariaLabel: string;
}) {
  const active = state !== "none";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        ...styles.triStateBox,
        ...(active ? styles.triStateBoxActive : {}),
      }}
    >
      {state === "all" && (
        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
          <path
            d="M1 4L3.5 6.5L9 1"
            stroke="#fff"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {state === "some" && <span style={styles.triStateDash} />}
    </button>
  );
}

// ── Offer actions (submit / cancel) ──────────────────────────────────

export function OfferActions({
  mode,
  submitting,
  cancelUrl,
}: {
  mode: "create" | "edit";
  submitting: boolean;
  cancelUrl: string;
}) {
  return (
    <div className="of-section-row">
      <div className="of-section-row-left" />
      <div className="of-section-row-right">
        <div style={styles.actionsRow}>
          <button
            type="submit"
            className="of-btn of-btn-primary of-btn-lg"
            style={styles.submitButton}
            disabled={submitting}
          >
            {submitting ? "Saving\u2026" : mode === "edit" ? "Save Changes" : "Save Offer"}
          </button>
          <AdminAppLink
            to={cancelUrl}
            className="of-btn of-btn-secondary of-btn-lg"
            style={{ ...styles.cancelButton, textDecoration: "none", color: "inherit" }}
          >
            Cancel
          </AdminAppLink>
        </div>
      </div>
    </div>
  );
}

// ── Page wrapper (header bar + form chrome) ──────────────────────────

export function OfferFormPage({
  mode,
  offerType,
  placement,
  children,
}: {
  mode: "create" | "edit";
  offerType: OfferType;
  placement: OfferPlacement;
  children: React.ReactNode;
}) {
  const heading =
    mode === "edit" ? "Edit Offer" : "Create New Offer";
  const subtitle = `${OFFER_TYPE_CONFIG[offerType].label} · ${placementHeaderLabel(placement)}`;
  return (
    <div className="appPageShell" style={styles.page}>
      <style>{globalCss}</style>
      <div className="appPageContent" style={styles.pageContent}>
        <div style={styles.headerBar}>
          <h2 style={styles.headerText}>{heading}</h2>
          <div style={styles.headerSubtitle}>{subtitle}</div>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Shared UI primitives ─────────────────────────────────────────────

function Field({
  label,
  required,
  error,
  last,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={last ? styles.fieldLast : styles.field}>
      <div style={styles.fieldLabel}>
        {label} {required && <span style={styles.asterisk}>*</span>}
      </div>
      {children}
      {error && <div style={styles.errorText}>{error}</div>}
    </div>
  );
}

// ── Option card (replaces the old plain native checkbox row) ─────────
//
// Visually presented as a selectable "card" — bordered box with a check
// indicator and label — instead of a bare checkbox input. Purely a
// presentational change: selection is still driven by `checked` /
// `onClick` exactly as before, and every existing hidden <input> that
// carries the actual submitted value is untouched.

function Checkbox({
  label,
  checked,
  onClick,
  noBorder,
}: {
  label: string;
  checked: boolean;
  onClick: () => void;
  noBorder?: boolean;
}) {
  return (
    <div
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      className={`of-option-card${checked ? " of-option-card-selected" : ""}`}
      style={{
        ...styles.optionCard,
        ...(noBorder ? { border: "none", padding: "10px 0" } : {}),
        ...(checked ? styles.optionCardSelected : {}),
      }}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <span
        className={`of-option-check${checked ? " of-option-check-selected" : ""}`}
        style={{
          ...styles.optionCheck,
          ...(checked ? styles.optionCheckSelected : {}),
        }}
        aria-hidden="true"
      >
        {checked && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path
              d="M1 4L3.5 6.5L9 1"
              stroke="#fff"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      <span style={styles.optionCardLabel}>{label}</span>
    </div>
  );
}

// ── Date range picker ────────────────────────────────────────────────

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
function fromISO(s: string) {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function formatLong(s: string) {
  const d = fromISO(s);
  if (!d) return "";
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}
function buildMonthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function DateRangePicker({
  activeFrom,
  activeTo,
  open,
  onOpen,
  onClose,
  onApply,
}: {
  activeFrom: string;
  activeTo: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onApply: (from: string, to: string) => void;
}) {
  const today = new Date();
  const [baseMonth, setBaseMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );
  const [tempFrom, setTempFrom] = useState(activeFrom);
  const [tempTo, setTempTo] = useState(activeTo);

  function openPicker() {
    setTempFrom(activeFrom);
    setTempTo(activeTo);
    onOpen();
  }

  function handleDayClick(date: Date) {
    const iso = toISO(date);
    if (!tempFrom || (tempFrom && tempTo)) {
      setTempFrom(iso);
      setTempTo("");
    } else {
      if (iso < tempFrom) {
        setTempTo(tempFrom);
        setTempFrom(iso);
      } else {
        setTempTo(iso);
      }
    }
  }

  function isInRange(date: Date) {
    if (!tempFrom) return false;
    const iso = toISO(date);
    const end = tempTo || tempFrom;
    return iso >= tempFrom && iso <= end;
  }
  function isEndpoint(date: Date) {
    const iso = toISO(date);
    return iso === tempFrom || iso === tempTo;
  }

  const label =
    activeFrom && activeTo
      ? `${formatLong(activeFrom)} - ${formatLong(activeTo)}`
      : "";

  const leftMonth = baseMonth;
  const rightMonth = new Date(
    baseMonth.getFullYear(),
    baseMonth.getMonth() + 1,
    1
  );

  return (
    <div style={{ position: "relative", maxWidth: 480 }}>
      <div style={styles.dateInputWrap} onClick={openPicker}>
        <input
          readOnly
          className="of-input"
          style={{ ...styles.input, cursor: "pointer", paddingRight: 40 }}
          value={label}
          placeholder="Select date range"
          onClick={openPicker}
        />
        <span style={styles.dateInputIcon}>📅</span>
      </div>
      {open && (
        <div style={styles.calendarPopover}>
          <div style={styles.calendarMonths}>
            <CalendarMonth
              date={leftMonth}
              onPrev={() =>
                setBaseMonth(
                  new Date(baseMonth.getFullYear(), baseMonth.getMonth() - 1, 1)
                )
              }
              showPrev
              onDayClick={handleDayClick}
              isInRange={isInRange}
              isEndpoint={isEndpoint}
            />
            <CalendarMonth
              date={rightMonth}
              onNext={() =>
                setBaseMonth(
                  new Date(baseMonth.getFullYear(), baseMonth.getMonth() + 1, 1)
                )
              }
              showNext
              onDayClick={handleDayClick}
              isInRange={isInRange}
              isEndpoint={isEndpoint}
            />
          </div>
          <div style={styles.calendarFooter}>
            <span style={styles.calendarFooterText}>
              {tempFrom && tempTo
                ? `${formatLong(tempFrom)} - ${formatLong(tempTo)}`
                : tempFrom
                ? formatLong(tempFrom)
                : "Select a date range"}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="of-btn of-btn-secondary"
                style={styles.cancelButton}
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="of-btn of-btn-primary"
                style={styles.submitButton}
                disabled={!tempFrom || !tempTo}
                onClick={() => onApply(tempFrom, tempTo || tempFrom)}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarMonth({
  date,
  onPrev,
  onNext,
  showPrev,
  showNext,
  onDayClick,
  isInRange,
  isEndpoint,
}: {
  date: Date;
  onPrev?: () => void;
  onNext?: () => void;
  showPrev?: boolean;
  showNext?: boolean;
  onDayClick: (d: Date) => void;
  isInRange: (d: Date) => boolean;
  isEndpoint: (d: Date) => boolean;
}) {
  const cells = buildMonthGrid(date.getFullYear(), date.getMonth());
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <div style={{ width: 260 }}>
      <div style={styles.calendarHeader}>
        <button
          type="button"
          className="of-cal-nav"
          style={{
            ...styles.calendarNavButton,
            visibility: showPrev ? "visible" : "hidden",
          }}
          onClick={onPrev}
        >
          ‹
        </button>
        <span style={styles.calendarMonthLabel}>
          {MONTH_NAMES[date.getMonth()]} {date.getFullYear()}
        </span>
        <button
          type="button"
          className="of-cal-nav"
          style={{
            ...styles.calendarNavButton,
            visibility: showNext ? "visible" : "hidden",
          }}
          onClick={onNext}
        >
          ›
        </button>
      </div>
      <div style={styles.calendarWeekRow}>
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <span key={d} style={styles.calendarWeekday}>{d}</span>
        ))}
      </div>
      {weeks.map((week, i) => (
        <div key={i} style={styles.calendarWeekRow}>
          {week.map((day, j) =>
            day ? (
              <button
                type="button"
                key={j}
                className="of-cal-day"
                onClick={() => onDayClick(day)}
                style={{
                  ...styles.calendarDay,
                  ...(isInRange(day) ? styles.calendarDayInRange : {}),
                  ...(isEndpoint(day) ? styles.calendarDaySelected : {}),
                }}
              >
                {day.getDate()}
              </button>
            ) : (
              <span key={j} style={styles.calendarDay} />
            )
          )}
        </div>
      ))}
    </div>
  );
}

// ── Global stylesheet (hover / focus / responsive states inline styles can't express) ──

const globalCss = `
  .of-section-row {
    display: flex;
    align-items: flex-start;
    gap: 40px;
    margin-bottom: 24px;
  }
  .of-section-row-left {
    width: 260px;
    flex-shrink: 0;
    padding-top: 2px;
  }
  .of-section-row-right {
    flex: 1;
    min-width: 0;
  }
  @media (max-width: 820px) {
    .of-section-row {
      flex-direction: column;
      gap: 10px;
    }
    .of-section-row-left {
      width: 100%;
    }
  }
  .of-input, .of-select {
    transition: border-color 120ms ease, box-shadow 120ms ease;
  }
  .of-input:hover, .of-select:hover {
    border-color: #b7bcc4;
  }
  .of-input:focus, .of-select:focus {
    outline: none;
    border-color: #008060;
    box-shadow: 0 0 0 3px rgba(0, 128, 96, 0.14);
  }
  .of-input::placeholder {
    color: #9AA1AC;
  }
  .of-select:disabled, .of-input:disabled {
    background: #F5F5F7;
    color: #9AA1AC;
    cursor: not-allowed;
  }
  .of-native-checkbox, .of-native-radio {
    accent-color: #008060;
  }
  .of-btn {
    transition: background 120ms ease, border-color 120ms ease, transform 120ms ease, box-shadow 120ms ease;
  }
  .of-btn:active {
    transform: translateY(1px);
  }
  .of-btn-primary:hover:not(:disabled) {
    background: #005C46;
  }
  .of-btn-primary:disabled {
    background: #9FDDC5;
    cursor: not-allowed;
  }
  .of-btn-secondary:hover {
    border-color: #9AA1AC;
    background: #FAFAFB;
  }
  .of-round-btn {
    transition: background 120ms ease, transform 120ms ease;
  }
  .of-round-btn:hover {
    transform: scale(1.08);
  }
  .of-round-remove:hover {
    background: #FBD6D2;
  }
  .of-round-add:hover {
    background: #C3F3CB;
  }
  .of-cal-day {
    transition: background 120ms ease;
  }
  .of-cal-day:hover {
    background: #E3F5EE;
  }
  .of-cal-nav {
    transition: background 120ms ease;
    border-radius: 6px;
  }
  .of-cal-nav:hover {
    background: #E3F5EE;
  }
  .of-condition-row {
    max-width: 100%;
  }

  /* ── Option cards (checkbox / radio replacements) ───────────────── */
  .of-option-card {
    transition: border-color 120ms ease, background 120ms ease, box-shadow 120ms ease;
  }
  .of-option-card:hover {
    border-color: #9AA1AC;
  }
  .of-option-card-selected:hover {
    border-color: #008060;
  }
  .of-option-card:focus-visible {
    outline: 2px solid #008060;
    outline-offset: 2px;
  }
  .of-option-check,
  .of-option-check-radio {
    transition: background 120ms ease, border-color 120ms ease;
  }
  .of-visually-hidden-input {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  /* ── "Edit products" modal ───────────────────────────────────────── */
  .of-picker-row {
    transition: background 120ms ease;
  }
  .of-picker-row:hover {
    background: #FAFAFB;
  }
`;

// ── Styles (single source of truth for the form) ─────────────────────

export const styles: Record<string, React.CSSProperties> = {
  page: {
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    color: "#1C1E21",
    background: "#F6F6F8",
    minHeight: "100%",
  },
  pageContent: {
    maxWidth: 1040,
    margin: "0 auto",
    padding: "32px 24px 64px",
  },
  headerBar: {
    padding: "0 2px 22px",
  },
  headerText: { margin: 0, fontSize: 20, fontWeight: 650, letterSpacing: "-0.01em" },
  headerSubtitle: { marginTop: 4, fontSize: 13, color: "#6B7280" },
  form: { padding: "24px 24px 40px", maxWidth: 900 },

  // card / section shell
  card: {
    background: "#FFFFFF",
    border: "1px solid #E4E5E9",
    borderRadius: 12,
    padding: "24px 26px",
    boxShadow: "0 1px 2px rgba(16, 24, 40, 0.03)",
  },
  section: { marginBottom: 8 },
  sectionHeading: {
    fontWeight: 650,
    fontSize: 15,
    color: "#1C1E21",
    marginBottom: 18,
    paddingBottom: 14,
    borderBottom: "1px solid #EEEFF2",
  },
  sectionRowTitle: { fontWeight: 650, fontSize: 15, color: "#1C1E21" },
  sectionRowDesc: { marginTop: 6, fontSize: 13, color: "#6B7280", lineHeight: 1.5 },

  field: { marginBottom: 26 },
  fieldLast: { marginBottom: 0 },
  fieldLabel: { fontWeight: 600, fontSize: 13.5, marginBottom: 9, color: "#33363B" },
  asterisk: { color: "#D0364A" },
  input: {
    width: "100%",
    maxWidth: 480,
    border: "1px solid #D4D6DC",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 14,
    color: "#1C1E21",
    background: "#fff",
    boxSizing: "border-box",
  },
  select: {
    border: "1px solid #D4D6DC",
    borderRadius: 8,
    padding: "9px 10px",
    fontSize: 14,
    background: "#fff",
    cursor: "pointer",
    minWidth: 140,
    flex: "1 1 140px",
    color: "#1C1E21",
  },

  typeBadgeWrap: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    background: "#E3F5EE",
    border: "1px solid #BFE8D9",
    borderRadius: 8,
    padding: "9px 14px",
    fontSize: 13,
    marginBottom: 28,
  },
  typeBadge: { fontWeight: 650, color: "#005C46" },
  typeBadgeDivider: {
    width: 3,
    height: 3,
    borderRadius: "50%",
    background: "#7FCDAE",
    display: "inline-block",
  },
  typeBadgeSecondary: { color: "#008060", fontWeight: 500 },

  checkRow: { display: "flex", gap: 12, flexWrap: "wrap" },
  checkCol: { display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" },

  // legacy — kept in case anything outside this file still references the
  // old native-checkbox styling; no longer used by the Checkbox component.
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    cursor: "pointer",
    width: "fit-content",
  },
  checkboxLabel: { fontSize: 14, color: "#1C1E21" },
  nativeCheckbox: {
    width: 17,
    height: 17,
    marginRight: 8,
    cursor: "pointer",
  },
  radioRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    cursor: "pointer",
    width: "fit-content",
  },
  nativeRadio: {
    width: 17,
    height: 17,
    marginRight: 8,
    cursor: "pointer",
  },

  // ── Option card (new checkbox / radio presentation) ─────────────────
  optionCard: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    borderRadius: 10,
    padding: "10px 14px",
    cursor: "pointer",
    background: "#fff",
    userSelect: "none",
    boxSizing: "border-box",
  },
  optionCardSelected: {
    background: "#F0FAF6",
  },
  optionCardLabel: {
    fontSize: 14,
    color: "#1C1E21",
    fontWeight: 500,
  },
  optionCheck: {
    width: 18,
    height: 18,
    borderRadius: 5,
    border: "1.5px solid #C7CBD1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    background: "#fff",
  },
  optionCheckSelected: {
    background: "#008060",
    borderColor: "#008060",
  },
  optionCheckRadio: {
    width: 18,
    height: 18,
    borderRadius: "50%",
    border: "1.5px solid #C7CBD1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    background: "#fff",
  },
  optionCheckRadioSelected: {
    borderColor: "#008060",
  },
  optionRadioDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#008060",
  },
  visuallyHiddenInput: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0,0,0,0)",
    whiteSpace: "nowrap",
    border: 0,
  },

  errorText: { color: "#D0364A", fontSize: 12.5, marginTop: 7 },
  emptyNotice: {
    marginTop: 8,
    fontSize: 13,
    color: "#6B7280",
    background: "#F6F6F8",
    border: "1px dashed #D4D6DC",
    borderRadius: 8,
    padding: "10px 12px",
  },
  noticeBox: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    background: "#F3F6FF",
    border: "1px solid #DCE5FD",
    borderRadius: 10,
    padding: "12px 14px",
    fontSize: 13,
    color: "#3B4A66",
    marginBottom: 18,
  },
  noticeIcon: {
    width: 18,
    height: 18,
    borderRadius: "50%",
    background: "#5B7CFA",
    color: "#fff",
    fontSize: 11,
    fontWeight: 700,
    fontStyle: "italic",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },

  // condition builder
  conditionBox: {
    border: "1px solid #E4E5E9",
    borderRadius: 10,
    padding: 16,
    marginTop: 12,
    background: "#FCFCFD",
  },
  conditionRow: {
    display: "flex",
    alignItems: "center",
    flexWrap: "nowrap",
    gap: 10,
    marginBottom: 10,
  },
  rowBadge: {
    width: 24,
    height: 24,
    borderRadius: "50%",
    background: "#EDEDF2",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 650,
    color: "#4B4E54",
    flexShrink: 0,
  },
  conditionValueInput: {
    flex: 1,
    minWidth: 0,
    border: "1px solid #D4D6DC",
    borderRadius: 8,
    padding: "9px 10px",
    fontSize: 14,
  },
  roundButtonRemove: {
    width: 24,
    height: 24,
    borderRadius: "50%",
    border: "none",
    background: "#FCE4E1",
    color: "#D0364A",
    fontSize: 15,
    lineHeight: 1,
    cursor: "pointer",
    flexShrink: 0,
  },
  roundButtonAdd: {
    width: 24,
    height: 24,
    borderRadius: "50%",
    border: "none",
    background: "#DBF6DF",
    color: "#1A8A3D",
    fontSize: 15,
    lineHeight: 1,
    cursor: "pointer",
    flexShrink: 0,
  },

  // manual product picker — trigger button + selection list
  editProductsButton: {
    marginLeft: 0,
    background: "#fff",
    color: "#1C1E21",
    border: "1px solid #D4D6DC",
    borderRadius: 8,
    padding: "9px 16px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  pickerRow: {
    display: "flex",
    gap: 10,
    marginLeft: 27,
    marginTop: 4,
    alignItems: "center",
    flexWrap: "wrap",
  },
  addButton: {
    background: "#008060",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "9px 18px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  selectionList: {
    marginLeft: 27,
    marginTop: 10,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  selectionItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "#F6F6F8",
    border: "1px solid #EEEFF2",
    borderRadius: 8,
    padding: "7px 10px 7px 8px",
    fontSize: 13,
    maxWidth: 460,
  },
  selectionItemInner: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  selectionItemText: {
    color: "#1C1E21",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  // shared product thumbnail
  thumb: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    background: "#F1F2F4",
    border: "1px solid #E4E5E9",
    overflow: "hidden",
    flexShrink: 0,
  },
  thumbImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },

  actionsRow: { display: "flex", gap: 12 },
  submitButton: {
    background: "#008060",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "11px 24px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  cancelButton: {
    background: "#fff",
    color: "#1C1E21",
    border: "1px solid #D4D6DC",
    borderRadius: 8,
    padding: "11px 24px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
  },

  // date input
  dateInputWrap: { position: "relative" },
  dateInputIcon: {
    position: "absolute",
    right: 12,
    top: "50%",
    transform: "translateY(-50%)",
    fontSize: 14,
    pointerEvents: "none",
  },

  // calendar
  calendarPopover: {
    position: "absolute",
    top: "calc(100% + 8px)",
    left: 0,
    background: "#fff",
    border: "1px solid #E4E5E9",
    borderRadius: 12,
    padding: 18,
    boxShadow: "0 12px 32px rgba(16, 24, 40, 0.16)",
    zIndex: 20,
  },
  calendarMonths: { display: "flex", gap: 24 },
  calendarHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  calendarMonthLabel: { fontSize: 13, fontWeight: 650, color: "#1C1E21" },
  calendarNavButton: {
    background: "none",
    border: "none",
    fontSize: 18,
    cursor: "pointer",
    color: "#6B7280",
    padding: "2px 8px",
  },
  calendarWeekRow: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  calendarWeekday: {
    width: 32,
    textAlign: "center",
    fontSize: 11,
    color: "#9AA1AC",
    fontWeight: 600,
  },
  calendarDay: {
    width: 32,
    height: 32,
    border: "none",
    background: "transparent",
    borderRadius: 8,
    fontSize: 13,
    cursor: "pointer",
    color: "#1C1E21",
  },
  calendarDayInRange: { background: "#E3F5EE" },
  calendarDaySelected: { background: "#008060", color: "#fff", fontWeight: 650 },
  calendarFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    paddingTop: 14,
    borderTop: "1px solid #EEEFF2",
    gap: 12,
  },
  calendarFooterText: { fontSize: 13, color: "#6B7280" },

  // ── "Edit products" modal ────────────────────────────────────────────
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(17, 19, 23, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    padding: 20,
  },
  modalCard: {
    background: "#fff",
    borderRadius: 12,
    width: "100%",
    maxWidth: 640,
    maxHeight: "min(680px, 90vh)",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 20px 60px rgba(16, 24, 40, 0.25)",
    overflow: "hidden",
  },
  modalHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "18px 24px",
    borderBottom: "1px solid #EEEFF2",
    flexShrink: 0,
  },
  modalHeaderTitle: { fontSize: 17, fontWeight: 650, color: "#1C1E21" },
  modalCloseButton: {
    background: "none",
    border: "none",
    fontSize: 22,
    lineHeight: 1,
    color: "#6B7280",
    cursor: "pointer",
    padding: 4,
  },
  modalSearchWrap: {
    position: "relative",
    padding: "16px 24px 8px",
    flexShrink: 0,
  },
  modalSearchIcon: {
    position: "absolute",
    left: 36,
    top: "50%",
    transform: "translateY(-50%)",
    pointerEvents: "none",
    display: "flex",
  },
  modalSearchInput: {
    width: "100%",
    maxWidth: "none",
    border: "1px solid #D4D6DC",
    borderRadius: 8,
    padding: "10px 12px 10px 38px",
    fontSize: 14,
    boxSizing: "border-box",
  },
  modalList: {
    overflowY: "auto",
    padding: "8px 12px 12px",
    flex: 1,
    minHeight: 120,
  },
  modalEmptyState: {
    padding: "32px 12px",
    textAlign: "center",
    fontSize: 13,
    color: "#9AA1AC",
  },
  modalRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    borderBottom: "1px solid #EEEFF2",
    cursor: "pointer",
  },
  modalRowSelected: {
    background: "#F6F6F8",
  },
  modalCheckbox: {
    width: 17,
    height: 17,
    cursor: "pointer",
    flexShrink: 0,
  },
  modalRowTitle: {
    fontSize: 14,
    color: "#1C1E21",
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  modalRowMeta: {
    fontSize: 13,
    color: "#6B7280",
    flexShrink: 0,
    minWidth: 90,
    textAlign: "right",
  },
  modalRowPrice: {
    fontSize: 13,
    color: "#1C1E21",
    fontWeight: 600,
    flexShrink: 0,
    minWidth: 70,
    textAlign: "right",
  },

  // ── Variant tree (product group with expandable variant rows) ──────
  modalGroup: {
    borderBottom: "1px solid #EEEFF2",
  },
  modalParentRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
  },
  modalParentTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "#1C1E21",
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  modalVariantRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "9px 12px 9px 60px",
    cursor: "pointer",
  },
  modalVariantTitle: {
    fontSize: 13.5,
    color: "#1C1E21",
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  triStateBox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    border: "1.5px solid #C7CBD1",
    background: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    cursor: "pointer",
    padding: 0,
  },
  triStateBoxActive: {
    background: "#008060",
    borderColor: "#008060",
  },
  triStateDash: {
    width: 8,
    height: 2,
    background: "#fff",
    borderRadius: 1,
  },

  modalFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "14px 24px",
    borderTop: "1px solid #EEEFF2",
    flexShrink: 0,
  },
  modalFooterCount: {
    fontSize: 13,
    color: "#6B7280",
  },
};