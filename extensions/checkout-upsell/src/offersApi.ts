/** Direct app origin — checkout UI runs on extensions.shopifycdn.com, so app-proxy URLs fail CORS. */
export const DEFAULT_APP_ORIGIN = "https://upsale.dynamicdreamz.net";

export function offersApiOrigin(settings?: { api_base?: string }): string {
  const fromSettings = settings?.api_base?.trim().replace(/\/$/, "");
  if (fromSettings) return fromSettings;
  return DEFAULT_APP_ORIGIN.replace(/\/$/, "");
}

export function offersApiUrl(
  path: "eligible" | "viewed" | "clicked" | "added-to-cart",
  settings?: { api_base?: string },
): string {
  return `${offersApiOrigin(settings)}/api/offers/${path}`;
}

export function aiEventsUrl(settings?: { api_base?: string }): string {
  return `${offersApiOrigin(settings)}/api/ai/events`;
}

export async function emitAiEvents(
  shop: string,
  settings: { api_base?: string } | undefined,
  events: Array<Record<string, unknown>>,
  consented: boolean,
): Promise<void> {
  if (!consented || events.length === 0 || !shop) return;
  await fetch(aiEventsUrl(settings), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shop, consented: true, events }),
  });
}
