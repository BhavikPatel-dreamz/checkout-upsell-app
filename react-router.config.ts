import type { Config } from "@react-router/dev/config";

// The dev server sees http://<host> while the embedded admin iframe posts from
// https://<app host>. React Router rejects that action as a bad request unless
// the app host is listed here. Admin session auth still runs inside the action.
function actionOriginHosts(): string[] {
  const hosts = new Set<string>([
    "admin.shopify.com",
    "upsell.dreamzapps.com",
    "upsale.dynamicdreamz.net",
    "upsale.dynamicdreamz.net:3003",
  ]);

  for (const value of [process.env.SHOPIFY_APP_URL, process.env.HOST]) {
    if (!value) continue;
    try {
      const url = new URL(value.includes("://") ? value : `https://${value}`);
      if (url.hostname) hosts.add(url.hostname);
      if (url.host) hosts.add(url.host);
    } catch {
      // Skip values that are not URLs.
    }
  }

  return [...hosts];
}

export default {
  ssr: true,
  allowedActionOrigins: actionOriginHosts(),
  future: {
    v8_middleware: true,
    v8_splitRouteModules: true,
    v8_viteEnvironmentApi: true,
    v8_passThroughRequests: true,
    v8_trailingSlashAwareDataRequests: true,
  },
} satisfies Config;
