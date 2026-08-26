import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  badRequest,
  methodNotAllowed,
  notFound,
  readJsonBody,
} from "../lib/http.server";
import {
  deleteOffer,
  getOffer,
  updateOffer,
  validateUpdateOffer,
} from "../models/offer.server";

// GET /api/offers/:id — fetch a single offer (scoped to this shop)
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const offer = await getOffer(session.shop, params.id!);
  if (!offer) return notFound("Offer not found.");
  return Response.json({ offer });
};

// PATCH /api/offers/:id — update ; DELETE /api/offers/:id — remove
export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const id = params.id;

  if (!id || !id.trim()) {
    console.warn("[OfferDelete] Missing offer id", { shop: session.shop });
    return badRequest({ id: "Offer ID is required." });
  }

  if (request.method === "PATCH" || request.method === "PUT") {
    const parsed = await readJsonBody(request);
    if (!parsed.ok) {
      return badRequest({ body: "Request body must be valid JSON." });
    }

    const body =
      typeof parsed.body === "object" && parsed.body !== null
        ? (parsed.body as Record<string, unknown>)
        : {};

    const hasStatusField = typeof body.isActive === "boolean";
    if (hasStatusField) {
      console.info("[OfferStatus] Started", {
        shop: session.shop,
        offerId: id,
        currentIsActive: body.isActive,
      });
    }

    const result = validateUpdateOffer({
      ...body,
      ...(typeof body.name === "undefined" && typeof body.title === "string"
        ? { name: body.title }
        : {}),
    });
    if (!result.ok) return badRequest(result.errors);

    const offer = await updateOffer(session.shop, id, result.data);
    if (!offer) return notFound("Offer not found.");

    if (hasStatusField) {
      console.info("[OfferStatus] Updated successfully", {
        shop: session.shop,
        offerId: id,
        type: offer.type,
        placement: offer.placement,
        newIsActive: offer.isActive,
      });
    }

    return Response.json({ offer });
  }

  if (request.method === "DELETE") {
    console.info("[OfferDelete] Started", { shop: session.shop, offerId: id });

    const existing = await getOffer(session.shop, id);
    console.info("[OfferDelete] offer found", { shop: session.shop, offerId: id, found: Boolean(existing) });

    const deleted = await deleteOffer(session.shop, id);
    if (!deleted) return notFound("Offer not found.");

    console.info("[OfferDelete] deleted successfully", { shop: session.shop, offerId: id });
    return Response.json({ ok: true });
  }

  return methodNotAllowed();
};
