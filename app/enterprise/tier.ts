/**
 * Enterprise deploy gate (AI-6.4). Isolated from Standard `app/ai`.
 * Shopify Plus is not Enterprise — Plus only gates checkout UI.
 *
 * Enable a client build with AI_TIER=enterprise, and/or list shops in
 * ENTERPRISE_SHOPS (comma-separated myshopify domains).
 */
export function isEnterpriseShop(
  shop: string,
  env: NodeJS.Dict<string> | undefined = process.env,
): boolean {
  const tier = env?.AI_TIER?.trim().toLowerCase();
  if (tier === "enterprise") return true;
  const needle = shop.trim().toLowerCase();
  if (!needle) return false;
  const listed = (env?.ENTERPRISE_SHOPS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return listed.includes(needle);
}

/** Autopilot publish is Enterprise AND an explicit merchant opt-in. Standard never publishes from this flag. */
export function autopilotMayPublish(input: {
  enterprise: boolean;
  autopilotEnabled: boolean;
}): boolean {
  return input.enterprise && input.autopilotEnabled;
}
