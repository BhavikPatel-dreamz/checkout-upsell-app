import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { badRequest, methodNotAllowed, readJsonBody } from "../lib/http.server";
import {
  createOffer,
  listOffers,
  validateCreateOffer,
} from "../models/offer.server";

// GET /api/offers — list this shop's offers
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const offers = await listOffers(session.shop);
  return Response.json({ offers });
};

// POST /api/offers — create an offer for this shop
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  if (request.method !== "POST") return methodNotAllowed();

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return badRequest({ body: "Request body must be valid JSON." });

  const result = validateCreateOffer(parsed.body);
  if (!result.ok) return badRequest(result.errors);

  const offer = await createOffer(session.shop, result.data);
  return Response.json({ offer }, { status: 201 });
};
