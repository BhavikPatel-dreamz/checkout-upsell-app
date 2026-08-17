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
  const id = params.id!;

  if (request.method === "PATCH" || request.method === "PUT") {
    const parsed = await readJsonBody(request);
    if (!parsed.ok) {
      return badRequest({ body: "Request body must be valid JSON." });
    }

    const result = validateUpdateOffer(parsed.body);
    if (!result.ok) return badRequest(result.errors);

    const offer = await updateOffer(session.shop, id, result.data);
    if (!offer) return notFound("Offer not found.");
    return Response.json({ offer });
  }

  if (request.method === "DELETE") {
    const deleted = await deleteOffer(session.shop, id);
    if (!deleted) return notFound("Offer not found.");
    return Response.json({ ok: true });
  }

  return methodNotAllowed();
};
