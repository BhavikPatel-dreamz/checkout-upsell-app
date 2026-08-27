import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { badRequest, methodNotAllowed, readJsonBody } from "../lib/http.server";
import { recordBrowseActivity } from "../models/browseActivity.server";

function isValidShopDomain(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]+\.myshopify\.com$/.test(value);
}

const CORS_HEADERS = new Headers({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Shopify-Shop-Domain",
});

function withCors(response: Response) {
  CORS_HEADERS.forEach((v, k) => response.headers.set(k, v));
  return response;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") return withCors(methodNotAllowed());

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return withCors(badRequest({ body: "Request body must be valid JSON." }));

  const body = parsed.body as Record<string, unknown>;
  const shop =
    (typeof body.shop === "string" && isValidShopDomain(body.shop) ? body.shop : null) ??
    (request.headers.get("x-shopify-shop-domain") && isValidShopDomain(request.headers.get("x-shopify-shop-domain"))
      ? request.headers.get("x-shopify-shop-domain")
      : null) ??
    new URL(request.url).searchParams.get("shop");

  if (!shop || !isValidShopDomain(shop)) {
    return withCors(badRequest({ shop: "Shop domain is required." }));
  }

  if (body.consented === false) {
    return withCors(Response.json({ recorded: false, skipped: "consent" }));
  }

  const result = await recordBrowseActivity({
    shop,
    eventType: typeof body.eventType === "string" ? body.eventType : "",
    customerId: typeof body.customerId === "string" ? body.customerId : null,
    guestKey: typeof body.guestKey === "string" ? body.guestKey : null,
    clientId: typeof body.clientId === "string" ? body.clientId : null,
    productId: typeof body.productId === "string" ? body.productId : null,
    variantId: typeof body.variantId === "string" ? body.variantId : null,
    collectionId: typeof body.collectionId === "string" ? body.collectionId : null,
    query: typeof body.query === "string" ? body.query : null,
    occurredAt:
      typeof body.occurredAt === "string" || typeof body.occurredAt === "number" ? body.occurredAt : null,
    consented: body.consented !== false,
  });

  if (!result.recorded && result.skipped === "invalid") {
    return withCors(badRequest({ body: "A valid eventType and shop-scoped identity are required." }));
  }
  if (!result.recorded && result.skipped === "identity") {
    return withCors(badRequest({ identity: "customerId, guestKey, or clientId is required." }));
  }

  return withCors(Response.json(result));
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return new Response(null, { status: 405, headers: CORS_HEADERS });
};
