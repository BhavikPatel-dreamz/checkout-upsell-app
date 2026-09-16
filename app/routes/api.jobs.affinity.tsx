import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { rebuildAffinityTables } from "../jobs/affinity.server";
import { env } from "../env.server";
import { methodNotAllowed } from "../lib/http.server";

function authorized(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  const expected = process.env.RETENTION_JOB_SECRET?.trim() || env.shopifyApiSecret;
  return token === expected;
}

async function run(request: Request) {
  if (!authorized(request)) {
    return new Response(null, { status: 401 });
  }
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop")?.trim() || undefined;
  const result = await rebuildAffinityTables(shop);
  return Response.json(result);
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") return methodNotAllowed();
  return run(request);
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method !== "GET") return methodNotAllowed();
  return run(request);
};
