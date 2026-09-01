import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";

function appPath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function appSlugFromReferrer(): string | null {
  try {
    const match = document.referrer.match(
      /admin\.shopify\.com\/store\/[^/]+\/apps\/([^/?#]+)/,
    );
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function adminAppUrlFromBridge(
  config: { host?: string; apiKey?: string } | undefined,
  path: string,
): string {
  const normalized = appPath(path);
  const appSlug = appSlugFromReferrer() || config?.apiKey;
  if (config?.host && appSlug) {
    try {
      const host = atob(config.host);
      if (host.startsWith("admin.shopify.com/")) {
        return `https://${host}/apps/${appSlug}${normalized}`;
      }
    } catch {
      // Fall through to the App Bridge protocol URL.
    }
  }
  if (appSlug) {
    return `shopify://admin/apps/${appSlug}${normalized}`;
  }
  return normalized;
}

export function AdminAppLink({
  to,
  className,
  style,
  children,
}: {
  to: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const shopify = useAppBridge();
  const [href, setHref] = useState(() => appPath(to));

  useEffect(() => {
    setHref(adminAppUrlFromBridge(shopify.config, to));
  }, [shopify, to]);

  return (
    <a
      href={href}
      className={className}
      style={style}
      onClick={(event) => {
        event.preventDefault();
        const navigateEvent = new CustomEvent("shopify:navigate", {
          bubbles: true,
          cancelable: true,
          detail: { url: appPath(to) },
        });
        event.currentTarget.dispatchEvent(navigateEvent);
        if (navigateEvent.defaultPrevented) return;
        open(adminAppUrlFromBridge(shopify.config, to), "_top");
      }}
    >
      {children}
    </a>
  );
}
