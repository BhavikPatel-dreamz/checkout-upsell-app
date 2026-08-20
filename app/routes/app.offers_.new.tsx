/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unified offer create / edit route.
 *
 * GET  /app/offers/new?type=pre-purchase        → pre-purchase form
 * GET  /app/offers/new?type=post-purchase        → post-purchase form
 * GET  /app/offers/new?id=<offerId>              → edit (placement from DB)
 *
 * Both create and edit go through the same OfferForm component.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useNavigate, redirect } from "react-router";
import { OfferPlacement } from "@prisma/client";

import { authenticate } from "../shopify.server";
import {
  buildOfferPayload,
  createOffer,
  getOffer,
  updateOffer,
} from "../models/offer.server";
import { listProductVariants } from "../models/productVariant.server";
import OfferForm, { OfferFormPage } from "../components/OfferForm";

import type { Product, ErrorMap } from "../components/OfferForm";

// ── Loader ─────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const offerId = url.searchParams.get("id");
  const typeParam = url.searchParams.get("type");

  const [variantRows, offer] = await Promise.all([
    listProductVariants(session.shop, 200),
    offerId ? getOffer(session.shop, offerId) : Promise.resolve(null),
  ]);

  const products: Product[] = Object.values(
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

  // Determine the placement for this request.
  // Priority: (1) existing offer's DB placement, (2) ?type= query param, (3) default checkout.
  let placement: OfferPlacement;
  if (offer) {
    placement = offer.placement as OfferPlacement;
  } else if (typeParam === "post-purchase") {
    placement = OfferPlacement.post_purchase;
  } else {
    placement = OfferPlacement.checkout;
  }

  return {
    products,
    placement,
    offer: offer
      ? {
          id: offer.id,
          title: offer.name,
          showUpsell: rawRules.showUpsell ?? "always",
          conditions: Array.isArray(rawRules.conditions)
            ? rawRules.conditions
            : [{ field: "", operator: "", value: "" }],
          displayLocation: rawRules.displayLocation ?? "checkout_page",
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

// ── Action ─────────────────────────────────────────────────────────────

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const offerId = String(formData.get("offerId") || "");

  const title = String(formData.get("title") || "").trim();
  const upsellType = String(formData.get("upsellType") || "pre-purchase");
  const placementRaw = String(formData.get("placement") || "");
  const showUpsell = String(formData.get("showUpsell") || "");
  const conditions = JSON.parse(String(formData.get("conditions") || "[]"));
  const displayLocation = String(formData.get("displayLocation") || "checkout_page");
  const upsellProduct = String(formData.get("upsellProduct") || "");
  const manualSelections = JSON.parse(
    String(formData.get("manualSelections") || "[]")
  );
  const offerType = String(formData.get("offerType") || "");
  const variantRows = await listProductVariants(session.shop, 500);
  const variantToProductId = new Map(
    variantRows.map((row) => [row.variantId, row.productId] as const)
  );
  const validProductIds = new Set(variantRows.map((row) => row.productId));
  const validVariantIds = new Set(variantRows.map((row) => row.variantId));

  if (
    upsellProduct === "manual" &&
    Array.isArray(manualSelections) &&
    manualSelections.some((item: any) => {
      const productId =
        typeof item?.productId === "string" ? item.productId : "";
      const variantId =
        typeof item?.variantId === "string" ? item.variantId : "";
      return (
        !productId ||
        !variantId ||
        !validProductIds.has(productId) ||
        !validVariantIds.has(variantId) ||
        variantToProductId.get(variantId) !== productId
      );
    })
  ) {
    return {
      errors: {
        upsellProduct: "Select a valid product and variant from this shop.",
      },
    };
  }

  const discountValue = formData.get("discountValue")
    ? Number(formData.get("discountValue"))
    : null;
  const activeFrom = String(formData.get("activeFrom") || "") || null;
  const activeTo = String(formData.get("activeTo") || "") || null;
  const promotionalTitle = String(formData.get("promotionalTitle") || "").trim();

  // ── Validation ────────────────────────────────────────────────────
  const errors: Record<string, string> = {};
  if (!title) errors.title = "Title is required";
  if (!showUpsell) errors.showUpsell = "Select when to show the upsell";
  if (showUpsell === "condition" && conditions.length === 0)
    errors.showUpsell = "Add at least one condition";
  if (!displayLocation)
    errors.displayLocation = "Select where to display the upsell";
  if (!upsellProduct)
    errors.upsellProduct = "Select how the upsell product is chosen";
  if (upsellProduct === "manual" && manualSelections.length === 0)
    errors.upsellProduct = "Add at least one product";
  if (!offerType) errors.offerType = "Select an offer type";
  if (offerType === "discount" && !discountValue)
    errors.offerType = "Enter a discount percentage";
  if (!promotionalTitle)
    errors.promotionalTitle = "Promotional title is required";

  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  // ── Build payload ────────────────────────────────────────────────
  const payload = buildOfferPayload({
    title,
    upsellType,
    showUpsell,
    conditions,
    displayOnCheckout: displayLocation !== "",
    upsellProduct,
    manualSelections,
    offerType,
    discountValue,
    activeFrom,
    activeTo,
    promotionalTitle,
  });

  // Store displayLocation in triggerRules for the form to read back on edit.
  if (payload.triggerRules && typeof payload.triggerRules === "object") {
    (payload.triggerRules as Record<string, unknown>).displayLocation =
      displayLocation;
  }

  // Respect the placement sent from the form (pre-purchase vs post-purchase).
  if (
    placementRaw === "post_purchase" ||
    placementRaw === "checkout"
  ) {
    payload.placement = placementRaw as OfferPlacement;
  }

  if (offerId) {
    await updateOffer(session.shop, offerId, {
      name: payload.name,
      type: payload.type,
      placement: payload.placement,
      targetProductIds: payload.targetProductIds,
      triggerRules: payload.triggerRules,
      isActive: payload.isActive,
    });
    return redirect("/app/offers");
  }

  await createOffer(session.shop, payload);
  return redirect("/app/offers?created=1");
}

// ── Component ──────────────────────────────────────────────────────────

export default function CreateOfferPage() {
  const { products, offer, placement } = useLoaderData<{
    products: Product[];
    offer: any;
    placement: OfferPlacement;
  }>();
  const navigate = useNavigate();
  const fetcher = useFetcher<{ errors?: ErrorMap }>();

  const errors = fetcher.data?.errors || {};
  const submitting = fetcher.state === "submitting";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    fetcher.submit(e.currentTarget, { method: "post" });
  }

  function handleCancel() {
    navigate("/app/offers");
  }

  return (
    <OfferFormPage placement={placement}>
      <fetcher.Form
        method="post"
        onSubmit={handleSubmit}
        style={{ padding: "24px 24px 40px", maxWidth: 900 }}
      >
        {offer?.id ? (
          <input type="hidden" name="offerId" value={offer.id} />
        ) : null}

        <OfferForm
          placement={placement}
          initialData={offer}
          products={products}
          fetcherErrors={errors}
        />

        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
          <button type="submit" style={submitBtnStyle} disabled={submitting}>
            {submitting ? "Saving\u2026" : "Submit"}
          </button>
          <button type="button" style={cancelBtnStyle} onClick={handleCancel}>
            Cancel
          </button>
        </div>
      </fetcher.Form>
    </OfferFormPage>
  );
}

// Inline button styles (kept here to avoid importing the full styles map)
const submitBtnStyle: React.CSSProperties = {
  background: "#1a1a1a",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "10px 22px",
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
};
const cancelBtnStyle: React.CSSProperties = {
  background: "#fff",
  color: "#202223",
  border: "1px solid #c9cccf",
  borderRadius: 6,
  padding: "10px 22px",
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
};
