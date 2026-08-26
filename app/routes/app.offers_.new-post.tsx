/**
 * Backward-compatibility redirect.
 *
 * /app/offers/new-post?id=... → /app/offers/new?id=...&type=post-purchase
 *
 * Existing bookmarks and internal links that point at the old post-purchase
 * creation route continue to work. The unified form at /app/offers/new
 * reads the `type` query param and renders the correct placement.
 */

import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);

  const url = new URL(request.url);
  const params = new URLSearchParams(url.search);

  // Ensure the type param signals post-purchase.
  params.set("type", "post-purchase");

  return redirect(`/app/offers/new?${params.toString()}`);
}
