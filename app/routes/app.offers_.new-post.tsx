/* eslint-disable @typescript-eslint/no-explicit-any */
// =======================================================================
// app/routes/app.offers.new-post.tsx
//
// POST-PURCHASE upsell creation/edit form.
// This is a standalone twin of app.offers.new.tsx (pre-purchase form).
// UI is identical to the pre-purchase form — the only functional
// difference is that upsellType/placement is hardcoded to
// "post-purchase" / "post_purchase" instead of being read from a
// query param, and the header label always reads "Post-Purchase".
// The "Display Upsell on" option remains "On Thank You Page" since
// that is where Shopify post-purchase upsells render.
// =======================================================================

import { useState, useEffect } from "react";
import {
  useFetcher,
  useLoaderData,
  useNavigate,
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { OfferPlacement } from "@prisma/client";
import { authenticate } from "../shopify.server";
import {
  buildOfferPayload,
  createOffer,
  getOffer,
  updateOffer,
} from "../models/offer.server";
import { listProductVariants } from "../models/productVariant.server";

// =======================================================================
// Loader — authenticates, and fetches synced product variants so the
// "Manual selection" picker works from the existing ProductVariant sync data.
// =======================================================================
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const offerId = url.searchParams.get("id");

  const [variantRows, offer] = await Promise.all([
    listProductVariants(session.shop, 200),
    offerId ? getOffer(session.shop, offerId) : Promise.resolve(null),
  ]);

  const products = Object.values(
    variantRows.reduce<Record<string, Product>>((acc, row) => {
      const productId = row.productId;
      const existing = acc[productId] ?? {
        id: row.productId,
        title: row.productTitle,
        image: row.imageUrl ?? null,
        variants: [],
      };

      const variant = {
        id: row.variantId,
        title: row.variantTitle ?? row.productTitle,
      };

      if (!existing.variants.some((item) => item.id === variant.id)) {
        existing.variants.push(variant);
      }

      acc[productId] = existing;
      return acc;
    }, {}),
  );

  const rawRules = (offer?.triggerRules as Record<string, any>) ?? {};
  const savedProductSelection = Array.isArray(rawRules.productSelection?.items)
    ? rawRules.productSelection.items
    : Array.isArray(rawRules.manualSelections)
      ? rawRules.manualSelections
      : [];

  return {
    products,
    offer: offer
      ? {
          id: offer.id,
          title: offer.name,
          showUpsell: rawRules.showUpsell ?? "always",
          conditions: Array.isArray(rawRules.conditions)
            ? rawRules.conditions
            : [{ field: "", operator: "", value: "" }],
          displayOnCheckout: Boolean(rawRules.displayOnCheckout ?? true),
          upsellProduct: rawRules.upsellProduct ?? "manual",
          manualSelections: savedProductSelection,
          offerType: rawRules.offerType ?? "free",
          discountValue: rawRules.discountValue ?? "",
          activeFrom: rawRules.activeFrom ?? "",
          activeTo: rawRules.activeTo ?? "",
          promotionalTitle: rawRules.promotionalTitle ?? "",
          isActive: offer.isActive,
        }
      : null,
  };
}

// =======================================================================
// Action — validates + persists the new offer, then redirects to the list.
// upsellType/placement is always "post-purchase" for this route.
// =======================================================================
export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const offerId = String(formData.get("offerId") || "");

  const title = String(formData.get("title") || "").trim();
  const upsellType = "post-purchase";
  const showUpsell = String(formData.get("showUpsell") || "");
  const conditions = JSON.parse(String(formData.get("conditions") || "[]"));
  const displayOnCheckout = formData.get("displayOnCheckout") === "on";
  const upsellProduct = String(formData.get("upsellProduct") || "");
  const manualSelections = JSON.parse(String(formData.get("manualSelections") || "[]"));
  const offerType = String(formData.get("offerType") || "");
  const variantRows = await listProductVariants(session.shop, 500);
  const variantToProductId = new Map(
    variantRows.map((row) => [row.variantId, row.productId] as const),
  );
  const validProductIds = new Set(variantRows.map((row) => row.productId));
  const validVariantIds = new Set(variantRows.map((row) => row.variantId));

  if (
    upsellProduct === "manual" &&
    Array.isArray(manualSelections) &&
    manualSelections.some((item: any) => {
      const productId = typeof item?.productId === "string" ? item.productId : "";
      const variantId = typeof item?.variantId === "string" ? item.variantId : "";
      return (
        !productId ||
        !variantId ||
        !validProductIds.has(productId) ||
        !validVariantIds.has(variantId) ||
        variantToProductId.get(variantId) !== productId
      );
    })
  ) {
    return { errors: { upsellProduct: "Select a valid product and variant from this shop." } };
  }
  const discountValue = formData.get("discountValue")
    ? Number(formData.get("discountValue"))
    : null;
  const activeFrom = String(formData.get("activeFrom") || "") || null;
  const activeTo = String(formData.get("activeTo") || "") || null;
  const promotionalTitle = String(formData.get("promotionalTitle") || "").trim();

  const errors: Record<string, string> = {};
  if (!title) errors.title = "Title is required";
  if (!showUpsell) errors.showUpsell = "Select when to show the upsell";
  if (showUpsell === "condition" && conditions.length === 0)
    errors.showUpsell = "Add at least one condition";
  if (!displayOnCheckout) errors.displayOnCheckout = "Select where to display the upsell";
  if (!upsellProduct) errors.upsellProduct = "Select how the upsell product is chosen";
  if (upsellProduct === "manual" && manualSelections.length === 0)
    errors.upsellProduct = "Add at least one product";
  if (!offerType) errors.offerType = "Select an offer type";
  if (offerType === "discount" && !discountValue)
    errors.offerType = "Enter a discount percentage";
  if (!promotionalTitle) errors.promotionalTitle = "Promotional title is required";

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  const payload = buildOfferPayload({
    title,
    upsellType,
    showUpsell,
    conditions,
    displayOnCheckout,
    upsellProduct,
    manualSelections,
    offerType,
    discountValue,
    activeFrom,
    activeTo,
    promotionalTitle,
  });

  // Force placement to post_purchase regardless of what buildOfferPayload derived,
  // since this route is exclusively for post-purchase (Thank You Page) offers.
  const targetPayload = {
    ...payload,
    placement: OfferPlacement.post_purchase,
  };

  if (offerId) {
    await updateOffer(session.shop, offerId, {
      name: targetPayload.name,
      type: targetPayload.type,
      placement: targetPayload.placement,
      targetProductIds: targetPayload.targetProductIds,
      triggerRules: targetPayload.triggerRules,
      isActive: targetPayload.isActive,
    });
    return redirect("/app/offers");
  }

  await createOffer(session.shop, targetPayload);
  return redirect("/app/offers?created=1");
}

// =======================================================================
// Types
// =======================================================================
type ErrorMap = Record<string, string>;
type Variant = { id: string; title: string };
type Product = { id: string; title: string; image: string | null; variants: Variant[] };
type ConditionRow = { id: string; field: string; operator: string; value: string };
type ManualSelection = {
  id: string;
  productId: string;
  productTitle: string;
  variantId: string;
  variantTitle: string;
};

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

// =======================================================================
// Component
// =======================================================================
export default function CreatePostPurchaseOfferPage() {
  const { products, offer } = useLoaderData<{ products: Product[]; offer: any }>();
  const navigate = useNavigate();
  const fetcher = useFetcher<{ errors?: ErrorMap }>();
  const hasSyncedProducts = products.length > 0;

  // This route is always post-purchase — no query param branching.
  const upsellType = "post-purchase";
  const typeLabel = "Post-Purchase";

  const [title, setTitle] = useState(offer?.title ?? "");
  const [showUpsell, setShowUpsell] = useState<"always" | "condition" | "">(
    offer?.showUpsell ?? ""
  );
  const [conditions, setConditions] = useState<ConditionRow[]>(
    offer?.conditions?.length
      ? offer.conditions.map((row: any) => ({
          id: nextRowId(),
          field: row.field ?? "",
          operator: row.operator ?? "",
          value: row.value ?? "",
        }))
      : [{ id: nextRowId(), field: "", operator: "", value: "" }]
  );

  const [displayOnCheckout, setDisplayOnCheckout] = useState<boolean>(
    offer?.displayOnCheckout ?? true
  );

  const [upsellProduct, setUpsellProduct] = useState<"manual" | "related" | "">(
    offer?.upsellProduct ?? ""
  );
  const [pickerProductId, setPickerProductId] = useState("");
  const [pickerVariantId, setPickerVariantId] = useState("");
  // Start empty; populate from loader `offer.manualSelections` after products are available
  // so we can derive productTitle / variantTitle from the synced ProductVariant catalog.
  const [manualSelections, setManualSelections] = useState<ManualSelection[]>([]);

  // Populate manualSelections with titles derived from `products` for each saved row.
  useEffect(() => {
    if (!offer || !Array.isArray(offer.manualSelections) || offer.manualSelections.length === 0) return;
    // don't overwrite if user already interacted
    if (manualSelections.length > 0) return;

    const productMap = new Map(products.map((p) => [p.id, p] as const));
    const populated = (offer.manualSelections as any[]).map((row: any, index: number) => {
      const productId = typeof row?.productId === "string" ? row.productId : "";
      const variantId = typeof row?.variantId === "string" ? row.variantId : "";
      const product = productMap.get(productId);
      const productTitle = product?.title ?? (typeof row?.productTitle === "string" ? row.productTitle : "");
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
  }, [offer, products]);

  // Initialize the product/variant picker when editing an existing offer.
  // If saved manual selections exist, pre-select the first one in the picker
  // so the editor shows the saved product and variant. This preserves the
  // saved Shopify GIDs exactly and does not change the stored structure.
  useEffect(() => {
    if (manualSelections.length > 0 && !pickerProductId) {
      const first = manualSelections[0];
      if (first.productId) setPickerProductId(first.productId);
      if (first.variantId) setPickerVariantId(first.variantId);
      // ensure the manual picker is visible
      setUpsellProduct((prev) => (prev === "" ? "manual" : prev));
    }
    // Only run when manualSelections changes (initial load)
  }, [manualSelections]);

  const [offerType, setOfferType] = useState<"free" | "discount" | "as-is" | "">
    (offer?.offerType ?? "");
  const [discountValue, setDiscountValue] = useState(String(offer?.discountValue ?? ""));

  const [activeFrom, setActiveFrom] = useState(offer?.activeFrom ?? "");
  const [activeTo, setActiveTo] = useState(offer?.activeTo ?? "");
  const [showDateRange, setShowDateRange] = useState(false);

  const [promotionalTitle, setPromotionalTitle] = useState(offer?.promotionalTitle ?? "");

  const errors = fetcher.data?.errors || {};
  const submitting = fetcher.state === "submitting";

  const pickerProduct = products.find((p) => p.id === pickerProductId);

  // ---- Condition row handlers ----
  function addConditionRow() {
    setConditions((prev) => [...prev, { id: nextRowId(), field: "", operator: "", value: "" }]);
  }
  function removeConditionRow(id: string) {
    setConditions((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  }
  function updateConditionRow(id: string, patch: Partial<ConditionRow>) {
    setConditions((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  // ---- Checkbox group selectors (single source of truth) ----
  function selectShowUpsell(value: "always" | "condition") {
    setShowUpsell(value);
  }

  function selectUpsellProduct(value: "manual" | "related") {
    setUpsellProduct(value);
  }

  function selectOfferType(value: "free" | "discount" | "as-is") {
    setOfferType(value);
  }

  // ---- Manual product picker handlers ----
  function handleAddProduct() {
    if (!pickerProduct) return;
    const variant = pickerProduct.variants.find((v) => v.id === pickerVariantId);
    if (!variant || !variant.id) return;
    setManualSelections((prev) => [
      ...prev,
      {
        id: nextRowId(),
        productId: pickerProduct.id,
        productTitle: pickerProduct.title,
        variantId: variant.id,
        variantTitle: variant.title,
      },
    ]);
    setPickerProductId("");
    setPickerVariantId("");
  }
  function removeManualSelection(id: string) {
    setManualSelections((prev) => prev.filter((r) => r.id !== id));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    fetcher.submit(e.currentTarget, { method: "post" });
  }

  function handleCancel() {
    navigate("/app/offers");
  }

  return (
    <div style={styles.page}>
      <div style={styles.headerBar}>
        <h2 style={styles.headerText}>Create New {typeLabel} Upsell</h2>
      </div>

      <fetcher.Form method="post" onSubmit={handleSubmit} style={styles.form}>
        {offer?.id ? <input type="hidden" name="offerId" value={offer.id} /> : null}
        <input type="hidden" name="upsellType" value={upsellType} />
        <input type="hidden" name="conditions" value={JSON.stringify(conditions)} />
        <input
          type="hidden"
          name="manualSelections"
          value={JSON.stringify(manualSelections)}
        />

        {/* Title */}
        <Field label="Title" required error={errors.title}>
          <input
            name="title"
            style={styles.input}
            placeholder="Enter title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>

        {/* Show Upsell */}
        <Field label="Show Upsell" required error={errors.showUpsell}>
          <div style={styles.checkRow}>
            <Checkbox
              label="Always"
              checked={showUpsell === "always"}
              onClick={() => selectShowUpsell("always")}
            />
            <Checkbox
              label="Based on Condition"
              checked={showUpsell === "condition"}
              onClick={() => selectShowUpsell("condition")}
            />
          </div>
          <input type="hidden" name="showUpsell" value={showUpsell} />

          {showUpsell === "condition" && (
            <div style={styles.conditionBox}>
              {conditions.map((row, idx) => (
                <div key={row.id} style={styles.conditionRow}>
                  <span style={styles.rowBadge}>{idx + 1}</span>
                  <select
                    style={styles.select}
                    value={row.field}
                    onChange={(e) => updateConditionRow(row.id, { field: e.target.value })}
                  >
                    <option value="">Field</option>
                    {FIELD_OPTIONS.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                  <select
                    style={styles.select}
                    value={row.operator}
                    onChange={(e) => updateConditionRow(row.id, { operator: e.target.value })}
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
                    onChange={(e) => updateConditionRow(row.id, { value: e.target.value })}
                  />
                  <button
                    type="button"
                    style={styles.roundButtonRemove}
                    onClick={() => removeConditionRow(row.id)}
                    aria-label="Remove condition"
                  >
                    −
                  </button>
                  {idx === conditions.length - 1 && (
                    <button
                      type="button"
                      style={styles.roundButtonAdd}
                      onClick={addConditionRow}
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

        {/* Display Upsell on — Post-Purchase renders on the Thank You Page */}
        <Field label="Display Upsell on" required error={errors.displayOnCheckout}>
          <Checkbox
            label="On Thank You Page"
            checked={displayOnCheckout}
            onClick={() => setDisplayOnCheckout((v: boolean) => !v)}
          />
          <input
            type="checkbox"
            name="displayOnCheckout"
            checked={displayOnCheckout}
            readOnly
            hidden
          />
        </Field>

        {/* Upsell Product */}
        <Field label="Upsell Product" required error={errors.upsellProduct}>
          <div style={styles.checkCol}>
            <Checkbox
              label="Manual selection"
              checked={upsellProduct === "manual"}
              onClick={() => selectUpsellProduct("manual")}
            />

            {upsellProduct === "manual" && (
              <div>
                {!hasSyncedProducts ? (
                  <div style={{ marginTop: 8, color: "#5C5F62" }}>
                    No synced products found. Please sync products first.
                  </div>
                ) : (
                  <div style={styles.pickerRow}>
                    <select
                      style={styles.select}
                      value={pickerProductId}
                      disabled={!hasSyncedProducts}
                      onChange={(e) => {
                        setPickerProductId(e.target.value);
                        setPickerVariantId("");
                      }}
                    >
                      <option value="">Select Product</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.title}</option>
                      ))}
                    </select>

                    <select
                      style={styles.select}
                      value={pickerVariantId}
                      disabled={!pickerProduct || !hasSyncedProducts}
                      onChange={(e) => setPickerVariantId(e.target.value)}
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
                      onClick={handleAddProduct}
                    >
                      Add
                    </button>
                  </div>
                )}
              </div>
            )}

            {upsellProduct === "manual" && manualSelections.length > 0 && (
              <div style={styles.selectionList}>
                {manualSelections.map((sel) => (
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
                      onClick={() => removeManualSelection(sel.id)}
                      aria-label="Remove product"
                    >
                      −
                    </button>
                  </div>
                ))}
              </div>
            )}

            <Checkbox
              label="Related Item form shopify based on items in order"
              checked={upsellProduct === "related"}
              onClick={() => selectUpsellProduct("related")}
            />
          </div>
          <input type="hidden" name="upsellProduct" value={upsellProduct} />
        </Field>

        {/* Offer on Upsell */}
        <Field label="Offer on Upsell" required error={errors.offerType}>
          <div style={styles.checkCol}>
            <Checkbox
              label="Free"
              checked={offerType === "free"}
              onClick={() => selectOfferType("free")}
            />
            <Checkbox
              label="Discount (% value)"
              checked={offerType === "discount"}
              onClick={() => selectOfferType("discount")}
            />
            {offerType === "discount" && (
              <input
                name="discountValue"
                type="number"
                min={0}
                max={100}
                placeholder="e.g. 15"
                style={{ ...styles.input, width: 140, marginLeft: 26 }}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
              />
            )}
            <Checkbox
              label="As it is"
              checked={offerType === "as-is"}
              onClick={() => selectOfferType("as-is")}
            />
          </div>
          <input type="hidden" name="offerType" value={offerType} />
        </Field>

        {/* Upsell active range */}
        <Field label="Upsell active range">
          <DateRangePicker
            activeFrom={activeFrom}
            activeTo={activeTo}
            open={showDateRange}
            onOpen={() => setShowDateRange(true)}
            onClose={() => setShowDateRange(false)}
            onApply={(from, to) => {
              setActiveFrom(from);
              setActiveTo(to);
              setShowDateRange(false);
            }}
          />
          <input type="hidden" name="activeFrom" value={activeFrom} />
          <input type="hidden" name="activeTo" value={activeTo} />
        </Field>

        {/* Promotional Title */}
        <Field label="Promotional Title for upsell" required error={errors.promotionalTitle}>
          <input
            name="promotionalTitle"
            style={styles.input}
            placeholder="Enter promotional title"
            value={promotionalTitle}
            onChange={(e) => setPromotionalTitle(e.target.value)}
          />
        </Field>

        {/* Actions */}
        <div style={styles.actionsRow}>
          <button type="submit" style={styles.submitButton} disabled={submitting}>
            {submitting ? "Saving…" : "Submit"}
          </button>
          <button type="button" style={styles.cancelButton} onClick={handleCancel}>
            Cancel
          </button>
        </div>
      </fetcher.Form>
    </div>
  );
}

// ---------------------------------------------------------------------
// Field / Checkbox
// ---------------------------------------------------------------------
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
      <label style={styles.checkboxLabel} onClick={onClick}>
        {label}
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------
// Date range picker — two-month calendar, matches the reference screenshot
// ---------------------------------------------------------------------
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
  const [baseMonth, setBaseMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
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
  const rightMonth = new Date(baseMonth.getFullYear(), baseMonth.getMonth() + 1, 1);

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
                setBaseMonth(new Date(baseMonth.getFullYear(), baseMonth.getMonth() - 1, 1))
              }
              showPrev
              onDayClick={handleDayClick}
              isInRange={isInRange}
              isEndpoint={isEndpoint}
            />
            <CalendarMonth
              date={rightMonth}
              onNext={() =>
                setBaseMonth(new Date(baseMonth.getFullYear(), baseMonth.getMonth() + 1, 1))
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
          style={{ ...styles.calendarNavButton, visibility: showPrev ? "visible" : "hidden" }}
          onClick={onPrev}
        >
          ‹
        </button>
        <span style={styles.calendarMonthLabel}>
          {MONTH_NAMES[date.getMonth()]} {date.getFullYear()}
        </span>
        <button
          type="button"
          style={{ ...styles.calendarNavButton, visibility: showNext ? "visible" : "hidden" }}
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

// ---------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------
const styles: Record<string, React.CSSProperties> = {
  page: {
    background: "#ffffff",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    color: "#202223",
  },
  headerBar: {
    background: "#f1f2f3",
    borderBottom: "1px solid #e1e3e5",
    padding: "14px 24px",
  },
  headerText: { margin: 0, fontSize: 15, fontWeight: 700 },
  form: { padding: "24px 24px 40px", maxWidth: 900 },
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
  checkRow: { display: "flex", gap: 32 },
  checkCol: { display: "flex", flexDirection: "column", gap: 12 },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    cursor: "pointer",
    width: "fit-content",
  },
  checkboxBox: {
    width: 18,
    height: 18,
    border: "1.5px solid #8c9196",
    borderRadius: 4,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    color: "#fff",
    flexShrink: 0,
  },
  checkboxBoxChecked: { background: "#1a1a1a", borderColor: "#1a1a1a" },
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
  pickerRow: { display: "flex", gap: 10, marginLeft: 28, marginTop: 4, alignItems: "center" },
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
  selectionList: { marginLeft: 28, marginTop: 10, display: "flex", flexDirection: "column", gap: 8 },
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
  calendarWeekRow: { display: "flex", justifyContent: "space-between", marginBottom: 2 },
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