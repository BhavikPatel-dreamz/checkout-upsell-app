/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unified offer create / edit route.
 *
 * GET /app/offers/new                      → offer type + placement selection
 * GET /app/offers/new?offerType=<type>&placement=<placement>
 *                                          → unified create form
 * GET /app/offers/new?type=post-purchase   → legacy alias → create form
 * GET /app/offers/new?id=<offerId>         → edit (type + placement from DB)
 *
 * Create and edit share the same OfferForm component, the same type-aware
 * validation, and the same create/update action — no per-type routes.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, redirect } from "react-router";
import { useRef, useEffect } from "react";
import type { OfferPlacement, OfferType } from "@prisma/client";

import { authenticate } from "../shopify.server";
import { storeCanUse, storeOfferUsage } from "../models/billing.server";
import { planAllows } from "../config/billingPlan";
import {
  buildOfferPayload,
  createOffer,
  getOffer,
  updateOffer,
  type OfferFormPayload,
} from "../models/offer.server";
import { listProductVariants } from "../models/productVariant.server";
import OfferForm, {
  OfferFormPage,
  OfferActions,
  type Product,
  type ErrorMap,
} from "../components/OfferForm";
import { AdminAppLink } from "../components/AdminAppLink";
import "../styles/analytics.css";
import OfferTypeSelector from "../components/OfferTypeSelector";
import {
  getOfferTypeConfig,
  isOfferPlacement,
  isPaidDealType,
  normalizeOfferType,
} from "../config/offerTypes";
import { validateOfferFields } from "../validation/offerSchemas";
import { placementFromDisplayLocation } from "../types/offer";
import "../styles/app._index.css";

// ── Loader ─────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const offerId = url.searchParams.get("id");
  const typeParam = url.searchParams.get("type");
  const offerTypeParam = url.searchParams.get("offerType");
  const placementParam = url.searchParams.get("placement");

  const [variantRows, offer, usage] = await Promise.all([
    listProductVariants(session.shop, 200),
    offerId ? getOffer(session.shop, offerId) : Promise.resolve(null),
    storeOfferUsage(session.shop),
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

  // Canonical offer type: DB record wins, then the ?offerType= param, then the
  // default (cross-sell). Only used to render the correct fields.
  const offerType: OfferType = offer
    ? offer.type
    : normalizeOfferType(offerTypeParam);

  // Placement priority: (1) existing offer's DB placement, (2) ?placement=,
  // (3) legacy ?type= alias, (4) the offer type's default placement.
  let placement: OfferPlacement;
  if (offer) {
    placement = offer.placement as OfferPlacement;
  } else if (isOfferPlacement(placementParam) && placementParam) {
    placement = placementParam;
  } else if (typeParam === "post-purchase") {
    placement = "post_purchase";
  } else if (typeParam === "pre-purchase") {
    placement = "checkout";
  } else {
    placement = getOfferTypeConfig(offerType).defaultPlacement;
  }

  const rawRules = (offer?.triggerRules as Record<string, any>) ?? {};
  const savedProductSelection = Array.isArray(rawRules.productSelection?.items)
    ? rawRules.productSelection.items
    : Array.isArray(rawRules.manualSelections)
      ? rawRules.manualSelections
      : [];

  return {
    canCreate: usage.canCreate,
    offerLimit: usage.limit,
    offerCount: usage.count,
    planName: usage.plan.name,
    allowPaidDealTypes: planAllows(usage.plan.id, "upsell_deals"),
    products,
    placement,
    offerType,
    mode: offer ? ("edit" as const) : ("create" as const),
    // Bare /app/offers/new shows the type+placement selection step first.
    isSelecting: !offer && !typeParam && !offerTypeParam && !placementParam,
    offer: offer
      ? {
          id: offer.id,
          title: offer.name,
          showUpsell: rawRules.showUpsell ?? "always",
          conditions: Array.isArray(rawRules.conditions)
            ? rawRules.conditions
            : [{ field: "", operator: "", value: "" }],
          displayLocation:
            offer.placement === "cart_drawer"
              ? "cart_drawer_upsell"
              : rawRules.displayLocation ?? "checkout_page",
          upsellProduct: rawRules.upsellProduct ?? "manual",
          triggerProductIds: Array.isArray(offer.targetProductIds)
            ? offer.targetProductIds
            : [],
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

  const displayLocation = String(formData.get("displayLocation") || "checkout_page");

  const payload: OfferFormPayload = {
    title: String(formData.get("title") || "").trim(),
    upsellType: String(formData.get("upsellType") || "pre-purchase"),
    type: normalizeOfferType(formData.get("type")),
    showUpsell: String(formData.get("showUpsell") || ""),
    conditions: JSON.parse(String(formData.get("conditions") || "[]")),
    displayOnCheckout: displayLocation !== "",
    displayLocation,
    upsellProduct: String(formData.get("upsellProduct") || ""),
    targetProductIds: JSON.parse(String(formData.get("targetProductIds") || "[]")),
    manualSelections: JSON.parse(
      String(formData.get("manualSelections") || "[]")
    ),
    offerType: String(formData.get("offerType") || ""),
    discountValue: formData.get("discountValue")
      ? Number(formData.get("discountValue"))
      : null,
    activeFrom: String(formData.get("activeFrom") || "") || null,
    activeTo: String(formData.get("activeTo") || "") || null,
    promotionalTitle: String(formData.get("promotionalTitle") || "").trim(),
  };

  const allowPaidDealTypes = await storeCanUse(session.shop, "upsell_deals");
  if (!allowPaidDealTypes && isPaidDealType(payload.offerType)) {
    payload.offerType = "as-is";
    payload.discountValue = null;
  }

  // Verify manual selections reference products/variants that actually exist
  // in this shop's synced catalog and are paired correctly.
  const variantRows = await listProductVariants(session.shop, 500);
  const variantToProductId = new Map(
    variantRows.map((row) => [row.variantId, row.productId] as const)
  );
  const validProductIds = new Set(variantRows.map((row) => row.productId));
  const validVariantIds = new Set(variantRows.map((row) => row.variantId));

  if (
    payload.upsellProduct === "manual" &&
    Array.isArray(payload.manualSelections) &&
    payload.manualSelections.some((item: any) => {
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

  // ── Validation (type-aware, shared with the JSON API) ──────────────
  const errors = validateOfferFields(payload as Record<string, unknown>, payload.type ?? "cross_sell");
  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  // ── Build payload ────────────────────────────────────────────────
  const built = buildOfferPayload(payload);

  const placementRaw = String(formData.get("placement") || "");
  const fallbackPlacement = isOfferPlacement(placementRaw)
    ? (placementRaw as OfferPlacement)
    : built.placement;
  built.placement = placementFromDisplayLocation(displayLocation, fallbackPlacement);

  if (built.placement === "post_purchase") {
    const allowed = await storeCanUse(session.shop, "post_purchase");
    if (!allowed) {
      return {
        errors: {
          placement: "Post-purchase offers are included on Silver. Free includes checkout offers only.",
        },
      };
    }
  }

  if (offerId) {
    await updateOffer(session.shop, offerId, {
      name: built.name,
      type: built.type,
      placement: built.placement,
      targetProductIds: built.targetProductIds,
      triggerRules: built.triggerRules,
      isActive: built.isActive,
    });
    return redirect("/app");
  }

  const usage = await storeOfferUsage(session.shop);
  if (!usage.canCreate) {
    return {
      errors: {
        name: `The ${usage.plan.name} plan allows ${usage.limit} offers. This store already has ${usage.count}.`,
      },
    };
  }

  await createOffer(session.shop, built);
  return redirect("/app?created=1");
}

// ── Component ──────────────────────────────────────────────────────────

export default function CreateOfferPage() {
  const { products, offer, placement, offerType, mode, isSelecting, canCreate, offerLimit, offerCount, planName, allowPaidDealTypes } =
    useLoaderData<{
      products: Product[];
      offer: any;
      placement: OfferPlacement;
      offerType: OfferType;
      mode: "create" | "edit";
      isSelecting: boolean;
      canCreate: boolean;
      offerLimit: number | null;
      offerCount: number;
      planName: string;
      allowPaidDealTypes: boolean;
    }>();
  const fetcher = useFetcher<{ errors?: ErrorMap }>();

  const errors = fetcher.data?.errors || {};
  const submitting = fetcher.state === "submitting";
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (Object.keys(errors).length > 0 && formRef.current) {
      setTimeout(() => {
        const firstErrorKey = Object.keys(errors)[0];
        const form = formRef.current;
        if (!form) return;
        // Try to find visible element first (for radio groups, selects, etc.)
        let errorElement = form.querySelector(`[name="${firstErrorKey}"]:not([type="hidden"])`) ||
          form.querySelector(`[data-error="${firstErrorKey}"]`);
        // Fallback to hidden input and find its visible parent (Field container)
        if (!errorElement) {
          const hiddenInput = form.querySelector(`[name="${firstErrorKey}"][type="hidden"]`);
          if (hiddenInput) {
            // Field component wraps in div with marginBottom style
            errorElement = hiddenInput.closest('[style*="marginBottom"]') || 
              hiddenInput.closest('div') || hiddenInput.parentElement;
          }
        }
        if (errorElement) {
          errorElement.scrollIntoView({ behavior: "smooth", block: "center" });
          (errorElement as HTMLElement).focus({ preventScroll: true });
        }
      }, 0);
    }
  }, [errors]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    fetcher.submit(e.currentTarget, { method: "post" });
  }

  if (mode === "create" && !canCreate) {
    return (
      <div className="analytics-locked">
        <div className="analytics-locked-blur" aria-hidden="true">
          <OfferFormPage mode="create" offerType={offerType} placement={placement} isSelecting>
            <OfferTypeSelector />
          </OfferFormPage>
        </div>
        <div className="analytics-locked-overlay">
          <div className="analytics-locked-card">
            <h2>Offer limit reached</h2>
            <p>
              The {planName} plan includes {offerLimit ?? "unlimited"} offers. This store already has {offerCount}.
              Upgrade to add another offer.
            </p>
            <AdminAppLink to="/app/billing" className="analytics-locked-button">
              View plans
            </AdminAppLink>
          </div>
        </div>
      </div>
    );
  }

  if (isSelecting) {
    return (
      <OfferFormPage mode="create" offerType={offerType} placement={placement} isSelecting>
        <OfferTypeSelector />
      </OfferFormPage>
    );
  }

  return (
    <OfferFormPage mode={mode} offerType={offerType} placement={placement}>
      <fetcher.Form
        method="post"
        onSubmit={handleSubmit}
        ref={formRef}
        style={{ padding: "0 0 40px", width: "100%", margin: "0 auto" }}
      >
        {offer?.id ? (
          <input type="hidden" name="offerId" value={offer.id} />
        ) : null}

        <OfferForm
          mode={mode}
          offerType={offerType}
          placement={placement}
          initialData={offer}
          products={products}
          fetcherErrors={errors}
          allowPaidDealTypes={allowPaidDealTypes}
        />

        <OfferActions mode={mode} submitting={submitting} />
      </fetcher.Form>
    </OfferFormPage>
  );
}
