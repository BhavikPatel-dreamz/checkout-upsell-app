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
 */

import { useState, useEffect } from "react";
import { Link } from "react-router";
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

// ── Public types ──────────────────────────────────────────────────────

export type Variant = { id: string; title: string };
export type Product = {
  id: string;
  title: string;
  image: string | null;
  variants: Variant[];
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
  pickerProductId: string;
  setPickerProductId: (value: string) => void;
  pickerVariantId: string;
  setPickerVariantId: (value: string) => void;
  manualSelections: ManualSelection[];
  handleAddProduct: () => void;
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
  const [triggerPickerProductId, setTriggerPickerProductId] = useState("");
  const [pickerProductId, setPickerProductId] = useState("");
  const [pickerVariantId, setPickerVariantId] = useState("");
  const [manualSelections, setManualSelections] = useState<ManualSelection[]>([]);
  const [triggerSelections, setTriggerSelections] = useState<TriggerSelection[]>([]);

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

  // Initialize the product/variant picker when editing.
  useEffect(() => {
    if (manualSelections.length > 0 && !pickerProductId) {
      const first = manualSelections[0];
      if (first.productId) setPickerProductId(first.productId);
      if (first.variantId) setPickerVariantId(first.variantId);
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
  const pickerProduct = products.find((p) => p.id === pickerProductId);

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

  function handleAddTriggerProduct() {
    if (!triggerPickerProductId) return;
    setTriggerSelections((prev) => {
      if (prev.some((item) => item.productId === triggerPickerProductId)) return prev;
      const product = products.find((p) => p.id === triggerPickerProductId);
      return [
        ...prev,
        {
          id: nextRowId(),
          productId: triggerPickerProductId,
          productTitle: product?.title ?? triggerPickerProductId,
        },
      ];
    });
    setTriggerPickerProductId("");
  }

  function removeTriggerSelection(id: string) {
    setTriggerSelections((prev) => prev.filter((item) => item.id !== id));
  }

  function handleAddProduct() {
    if (!pickerProduct) return;
    const variant = pickerProduct.variants.find((v) => v.id === pickerVariantId);
    if (!variant || !variant.id) return;
    setManualSelections((prev) => {
      if (prev.some((item) => item.variantId === variant.id)) return prev;
      return [
        ...prev,
        {
          id: nextRowId(),
          productId: pickerProduct.id,
          productTitle: pickerProduct.title,
          variantId: variant.id,
          variantTitle: variant.title,
        },
      ];
    });
    setPickerProductId("");
    setPickerVariantId("");
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
    pickerProductId,
    setPickerProductId,
    pickerVariantId,
    setPickerVariantId,
    manualSelections,
    handleAddProduct,
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

      <Field label="Offer Type">
        <div style={styles.typeBadge}>
          {OFFER_TYPE_CONFIG[offerType].label}
          <span style={styles.typeBadgeSeparator}>·</span>
          {placementHeaderLabel(placement)}
        </div>
      </Field>

      <CommonOfferFields state={state} errors={errors} locationOptions={locationOptions} />

      {getOfferTypeConfig(offerType).requiresTriggerProducts && (
        <div style={styles.section}>
          <TriggerProductField
            products={products}
            selected={triggerSelections}
            value={triggerPickerProductId}
            onValueChange={setTriggerPickerProductId}
            onAdd={handleAddTriggerProduct}
            onRemove={removeTriggerSelection}
            error={errors.targetProductIds}
          />
        </div>
      )}

      {getOfferTypeConfig(offerType).poolOnly && (
        <p style={{ fontSize: 13, color: "#5C5F62", margin: "0 0 12px" }}>
          This type uses browse activity to choose which pool product to show. It does not create new offers by itself.
        </p>
      )}

      {typeSpecificFieldIds.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionHeading}>Offer Configuration</div>
          <TypeSpecificFields
            state={state}
            errors={errors}
            products={products}
            hasSyncedProducts={hasSyncedProducts}
            fieldIds={typeSpecificFieldIds}
            poolOnly={Boolean(typeConfig.poolOnly)}
          />
        </div>
      )}

      {/* Schedule */}
      <div style={styles.section}>
        <div style={styles.sectionHeading}>Schedule</div>
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
      </div>
    </>
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
    <div style={styles.section}>
      <div style={styles.sectionHeading}>Basic Information</div>

      {/* Title */}
      <Field label="Title" required error={errors.title}>
        <input
          name="title"
          style={styles.input}
          placeholder="Enter title"
          value={state.title}
          onChange={(e) => state.setTitle(e.target.value)}
        />
      </Field>

      {/* Promotional Title */}
      <Field label="Promotional Title" required error={errors.promotionalTitle}>
        <input
          name="promotionalTitle"
          style={styles.input}
          placeholder="Enter promotional title"
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
              <div key={row.id} style={styles.conditionRow}>
                <span style={styles.rowBadge}>{idx + 1}</span>
                <select
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
                  style={styles.conditionValueInput}
                  placeholder="Value"
                  value={row.value}
                  onChange={(e) => state.updateConditionRow(row.id, { value: e.target.value })}
                />
                <button
                  type="button"
                  style={styles.roundButtonRemove}
                  onClick={() => state.removeConditionRow(row.id)}
                  aria-label="Remove condition"
                >
                  −
                </button>
                {idx === state.conditions.length - 1 && (
                  <button
                    type="button"
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
      <Field label="Display Upsell on" required error={errors.displayLocation}>
        <div style={styles.checkCol}>
          {locationOptions.map((opt) => (
            <label key={opt.value} style={styles.radioRow}>
              <input
                type="radio"
                name="displayLocation"
                value={opt.value}
                checked={state.displayLocation === opt.value}
                onChange={() => state.setDisplayLocation(opt.value)}
                style={styles.nativeRadio}
              />
              <span style={styles.checkboxLabel}>{opt.label}</span>
            </label>
          ))}
        </div>
      </Field>
    </div>
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
  const pickerProduct = products.find((p) => p.id === state.pickerProductId);

  return (
    <Field label={poolOnly ? "Upsell product pool" : "Upsell Product"} required error={errors.upsellProduct}>
      <div style={styles.checkCol}>
        <Checkbox
          label={poolOnly ? "Products AI may recommend (manual pool)" : "Manual selection"}
          checked={state.upsellProduct === "manual"}
          onClick={() => state.setUpsellProduct("manual")}
        />

        {state.upsellProduct === "manual" && (
          <div>
            {!hasSyncedProducts ? (
              <div style={{ marginTop: 8, color: "#5C5F62" }}>
                No synced products found. Please sync products first.
              </div>
            ) : (
              <div style={styles.pickerRow}>
                <select
                  style={styles.select}
                  value={state.pickerProductId}
                  disabled={!hasSyncedProducts}
                  onChange={(e) => {
                    state.setPickerProductId(e.target.value);
                    state.setPickerVariantId("");
                  }}
                >
                  <option value="">Select Product</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>

                <select
                  style={styles.select}
                  value={state.pickerVariantId}
                  disabled={!pickerProduct || !hasSyncedProducts}
                  onChange={(e) => state.setPickerVariantId(e.target.value)}
                >
                  <option value="">
                    {pickerProduct ? "Select Variant" : "First Select Product"}
                  </option>
                  {pickerProduct?.variants.map((v) => (
                    <option key={v.id} value={v.id}>{v.title}</option>
                  ))}
                </select>

                <button
                  type="button"
                  style={styles.addButton}
                  disabled={!pickerProduct || !hasSyncedProducts}
                  onClick={state.handleAddProduct}
                >
                  Add
                </button>
              </div>
            )}
          </div>
        )}

        {state.upsellProduct === "manual" && state.manualSelections.length > 0 && (
          <div style={styles.selectionList}>
            {state.manualSelections.map((sel) => (
              <div key={sel.id} style={styles.selectionItem}>
                <span>
                  {sel.productTitle}
                  {sel.variantTitle && sel.variantTitle !== "Default Title"
                    ? ` — ${sel.variantTitle}`
                    : ""}
                </span>
                <button
                  type="button"
                  style={styles.roundButtonRemove}
                  onClick={() => state.removeManualSelection(sel.id)}
                  aria-label="Remove product"
                >
                  −
                </button>
              </div>
            ))}
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
  value,
  onValueChange,
  onAdd,
  onRemove,
  error,
}: {
  products: Product[];
  selected: TriggerSelection[];
  value: string;
  onValueChange: (v: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  error?: string;
}) {
  return (
    <Field label="Main Products" required error={error}>
      <div style={styles.pickerRow}>
        <select
          style={styles.select}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
        >
          <option value="">Select trigger product</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>{product.title}</option>
          ))}
        </select>

        <button type="button" style={styles.addButton} disabled={!value} onClick={onAdd}>
          Add
        </button>
      </div>

      {selected.length > 0 && (
        <div style={styles.selectionList}>
          {selected.map((item) => (
            <div key={item.id} style={styles.selectionItem}>
              <span>{item.productTitle}</span>
              <button
                type="button"
                style={styles.roundButtonRemove}
                onClick={() => onRemove(item.id)}
                aria-label="Remove trigger product"
              >
                −
              </button>
            </div>
          ))}
        </div>
      )}
    </Field>
  );
}

function DealTypeField({ state, errors }: { state: OfferFormState; errors: ErrorMap }) {
  return (
    <Field label="Offer on Upsell" required error={errors.offerType}>
      <div style={styles.checkCol}>
        {DEAL_TYPE_OPTIONS.map((option) => (
          <div key={option.value}>
            <Checkbox
              label={option.label}
              checked={state.dealType === option.value}
              onClick={() => state.setDealType(option.value)}
            />
            {option.value === "discount" && state.dealType === "discount" && (
              <input
                name="discountValue"
                type="number"
                min={0}
                max={100}
                placeholder="e.g. 15"
                style={{ ...styles.input, width: 140, marginLeft: 26 }}
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
    <div style={styles.actionsRow}>
      <button type="submit" style={styles.submitButton} disabled={submitting}>
        {submitting ? "Saving\u2026" : mode === "edit" ? "Save Changes" : "Save Offer"}
      </button>
      <Link to={cancelUrl} style={{ ...styles.cancelButton, textDecoration: "none", color: "inherit" }}>
        Cancel
      </Link>
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
      <div className="appPageContent">
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
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={styles.field}>
      <div style={styles.fieldLabel}>
        {label} {required && <span style={styles.asterisk}>*</span>}
      </div>
      {children}
      {error && <div style={styles.errorText}>{error}</div>}
    </div>
  );
}

function Checkbox({
  label,
  checked,
  onClick,
}: {
  label: string;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <div style={styles.checkboxRow}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onClick}
        aria-checked={checked}
        style={styles.nativeCheckbox}
      />
      <label
        style={styles.checkboxLabel}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
        role="presentation"
      >
        {label}
      </label>
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
    <div style={{ position: "relative", maxWidth: 820 }}>
      <input
        readOnly
        style={styles.input}
        value={label}
        placeholder="Select date range"
        onClick={openPicker}
      />
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
              <button type="button" style={styles.cancelButton} onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
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

// ── Styles (single source of truth for the form) ─────────────────────

export const styles: Record<string, React.CSSProperties> = {
  page: {
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    color: "#202223",
  },
  headerBar: {
    padding: "0 0 20px",
  },
  headerText: { margin: 0, fontSize: 15, fontWeight: 700 },
  headerSubtitle: { marginTop: 2, fontSize: 12, color: "#616161" },
  form: { padding: "24px 24px 40px", maxWidth: 900 },
  section: { marginBottom: 8 },
  sectionHeading: {
    fontWeight: 700,
    fontSize: 15,
    color: "#202223",
    padding: "14px 0 4px",
    marginBottom: 10,
  },
  field: { marginBottom: 26 },
  fieldLabel: { fontWeight: 700, fontSize: 14, marginBottom: 10 },
  asterisk: { color: "#d72c0d" },
  input: {
    width: "100%",
    maxWidth: 820,
    border: "1px solid #c9cccf",
    borderRadius: 6,
    padding: "10px 12px",
    fontSize: 14,
    boxSizing: "border-box",
    cursor: "pointer",
  },
  select: {
    border: "1px solid #c9cccf",
    borderRadius: 6,
    padding: "9px 10px",
    fontSize: 14,
    background: "#fff",
    cursor: "pointer",
    minWidth: 180,
  },
  typeBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    background: "#f6f6f7",
    border: "1px solid #e1e3e5",
    borderRadius: 6,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 600,
    color: "#202223",
  },
  typeBadgeSeparator: { color: "#8c9196" },
  checkRow: { display: "flex", gap: 32 },
  checkCol: { display: "flex", flexDirection: "column", gap: 12 },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    cursor: "pointer",
    width: "fit-content",
  },
  checkboxLabel: { fontSize: 14 },
  nativeCheckbox: {
    width: 18,
    height: 18,
    marginRight: 8,
    cursor: "pointer",
    WebkitAppearance: "checkbox",
    MozAppearance: "checkbox",
    appearance: "checkbox",
  },
  radioRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    cursor: "pointer",
    width: "fit-content",
  },
  nativeRadio: {
    width: 18,
    height: 18,
    marginRight: 8,
    cursor: "pointer",
  },
  errorText: { color: "#d72c0d", fontSize: 12, marginTop: 6 },

  // condition builder
  conditionBox: {
    border: "1px solid #e1e3e5",
    borderRadius: 8,
    padding: 16,
    marginTop: 12,
    maxWidth: 820,
  },
  conditionRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  rowBadge: {
    width: 26,
    height: 26,
    borderRadius: "50%",
    background: "#f1f2f3",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 600,
    flexShrink: 0,
  },
  conditionValueInput: {
    flex: 1,
    border: "1px solid #c9cccf",
    borderRadius: 6,
    padding: "9px 10px",
    fontSize: 14,
  },
  roundButtonRemove: {
    width: 26,
    height: 26,
    borderRadius: "50%",
    border: "none",
    background: "#fce8e6",
    color: "#d72c0d",
    fontSize: 16,
    lineHeight: 1,
    cursor: "pointer",
    flexShrink: 0,
  },
  roundButtonAdd: {
    width: 26,
    height: 26,
    borderRadius: "50%",
    border: "none",
    background: "#d3f9d8",
    color: "#1a7f37",
    fontSize: 16,
    lineHeight: 1,
    cursor: "pointer",
    flexShrink: 0,
  },

  // manual product picker
  pickerRow: {
    display: "flex",
    gap: 10,
    marginLeft: 28,
    marginTop: 4,
    alignItems: "center",
  },
  addButton: {
    background: "#1a1a1a",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "9px 18px",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  },
  selectionList: {
    marginLeft: 28,
    marginTop: 10,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  selectionItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "#f6f6f7",
    borderRadius: 6,
    padding: "8px 12px",
    fontSize: 13,
    maxWidth: 500,
  },

  actionsRow: { display: "flex", gap: 12, marginTop: 8 },
  submitButton: {
    background: "#1a1a1a",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "10px 22px",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },
  cancelButton: {
    background: "#fff",
    color: "#202223",
    border: "1px solid #c9cccf",
    borderRadius: 6,
    padding: "10px 22px",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },

  // calendar
  calendarPopover: {
    position: "absolute",
    top: "calc(100% + 6px)",
    left: 0,
    background: "#fff",
    border: "1px solid #c9cccf",
    borderRadius: 8,
    padding: 16,
    boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
    zIndex: 20,
  },
  calendarMonths: { display: "flex", gap: 24 },
  calendarHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  calendarMonthLabel: { fontSize: 13, fontWeight: 600 },
  calendarNavButton: {
    background: "none",
    border: "none",
    fontSize: 18,
    cursor: "pointer",
    color: "#616161",
    padding: "0 6px",
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
    color: "#8c9196",
  },
  calendarDay: {
    width: 32,
    height: 32,
    border: "none",
    background: "transparent",
    borderRadius: 6,
    fontSize: 13,
    cursor: "pointer",
  },
  calendarDayInRange: { background: "#eef4fb" },
  calendarDaySelected: { background: "#2c6ecb", color: "#fff", fontWeight: 600 },
  calendarFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    paddingTop: 12,
    borderTop: "1px solid #e1e3e5",
    gap: 12,
  },
  calendarFooterText: { fontSize: 13, color: "#616161" },
};
