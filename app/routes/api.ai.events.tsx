import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { ingestShopperEventBatch } from "../ai/events/ingest.server";
import { badRequest, methodNotAllowed, readJsonBody } from "../lib/http.server";

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
    (request.headers.get("x-shopify-shop-domain") &&
    isValidShopDomain(request.headers.get("x-shopify-shop-domain"))
      ? request.headers.get("x-shopify-shop-domain")
      : null);

  if (!shop || !isValidShopDomain(shop)) {
    return withCors(badRequest({ shop: "Shop domain is required." }));
  }

  const result = await ingestShopperEventBatch({
    shop,
    consented: body.consented !== false,
    events: body.events,
  });

  return withCors(Response.json(result));
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return new Response(null, { status: 405, headers: CORS_HEADERS });
};
