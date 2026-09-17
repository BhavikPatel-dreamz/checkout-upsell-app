import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { decideForRequest } from "../ai/decide/decide.server";
import { decideRequestSchema } from "../ai/decide/contract";
import { corsPreflight, jsonWithCors } from "../lib/cors.server";
import { readJsonBody } from "../lib/http.server";
import { authenticate } from "../shopify.server";

function isValidShopDomain(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]+\.myshopify\.com$/.test(value);
}

async function resolveShop(request: Request, bodyShop?: unknown): Promise<string | null> {
  if (isValidShopDomain(bodyShop)) return bodyShop;
  const header = request.headers.get("x-shopify-shop-domain");
  if (isValidShopDomain(header)) return header;
  try {
    const { session } = await authenticate.admin(request);
    return session.shop;
  } catch {
    return null;
  }
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") return corsPreflight();
  if (request.method !== "POST") return jsonWithCors({ error: "Method not allowed" }, { status: 405 });

  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return jsonWithCors({ errors: { body: "Request body must be valid JSON." } }, { status: 400 });
  }

  const payload = decideRequestSchema.safeParse(parsed.body);
  if (!payload.success) {
    return jsonWithCors({ errors: { body: "Invalid decide payload." } }, { status: 400 });
  }

  const shop = await resolveShop(request, payload.data.shop);
  if (!shop) {
    return jsonWithCors({ errors: { shop: "Shop domain is required." } }, { status: 400 });
  }

  const decision = await decideForRequest({ ...payload.data, shop });
  return jsonWithCors(decision);
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") return corsPreflight();
  return jsonWithCors({ error: "Method not allowed" }, { status: 405 });
};
