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
import { useFetcher, useLoaderData, useNavigate, redirect } from "react-router";
import type { OfferPlacement, OfferType } from "@prisma/client";

import { authenticate } from "../shopify.server";
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
import OfferTypeSelector from "../components/OfferTypeSelector";
import {
  getOfferTypeConfig,
  isOfferPlacement,
  normalizeOfferType,
} from "../config/offerTypes";
import { validateOfferFields } from "../validation/offerSchemas";
import "../styles/app._index.css";

// ── Loader ─────────────────────────────────────────────────────────────

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const offerId = url.searchParams.get("id");
  const typeParam = url.searchParams.get("type");
  const offerTypeParam = url.searchParams.get("offerType");
  const placementParam = url.searchParams.get("placement");

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
          displayLocation: rawRules.displayLocation ?? "checkout_page",
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

  // Respect the placement sent from the form (pre-purchase vs post-purchase).
  const placementRaw = String(formData.get("placement") || "");
  if (placementRaw === "post_purchase" || placementRaw === "checkout") {
    built.placement = placementRaw as OfferPlacement;
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

  await createOffer(session.shop, built);
  return redirect("/app?created=1");
}

// ── Component ──────────────────────────────────────────────────────────

export default function CreateOfferPage() {
  const { products, offer, placement, offerType, mode, isSelecting } =
    useLoaderData<{
      products: Product[];
      offer: any;
      placement: OfferPlacement;
      offerType: OfferType;
      mode: "create" | "edit";
      isSelecting: boolean;
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
    navigate("/app");
  }

  if (isSelecting) {
    return (
      <OfferFormPage mode="create" offerType={offerType} placement={placement}>
        <OfferTypeSelector />
      </OfferFormPage>
    );
  }

  return (
    <OfferFormPage mode={mode} offerType={offerType} placement={placement}>
      <fetcher.Form
        method="post"
        onSubmit={handleSubmit}
        style={{ padding: "24px 0 40px", maxWidth: 900 }}
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
        />

        <OfferActions mode={mode} submitting={submitting} onCancel={handleCancel} />
      </fetcher.Form>
    </OfferFormPage>
  );
}
