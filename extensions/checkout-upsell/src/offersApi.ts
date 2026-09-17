/** Direct app origin — checkout UI runs on extensions.shopifycdn.com, so app-proxy URLs fail CORS. */
export const DEFAULT_APP_ORIGIN = "https://upsell.dreamzapps.com";

const DEV_ONLY_HOSTS = new Set(["upsale.dynamicdreamz.net", "localhost", "127.0.0.1"]);

function isUsableAppOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    if (DEV_ONLY_HOSTS.has(url.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

export function offersApiOrigin(settings?: { api_base?: string }): string {
  const fromSettings = settings?.api_base?.trim().replace(/\/$/, "");
  if (fromSettings && isUsableAppOrigin(fromSettings)) return fromSettings;
  return DEFAULT_APP_ORIGIN.replace(/\/$/, "");
}

export function offersApiUrl(
  path: "eligible" | "viewed" | "clicked" | "added-to-cart",
  settings?: { api_base?: string },
): string {
  return `${offersApiOrigin(settings)}/api/offers/${path}`;
}
