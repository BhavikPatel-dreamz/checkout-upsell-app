import { useEffect, useState } from "react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { useNavigate, useRouteLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

function appPath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

/**
 * Absolute Shopify admin URL for an in-app path, e.g.
 * https://admin.shopify.com/store/my-shop/apps/my-app-36/app/upsells
 *
 * `hostB64` (from App Bridge) supplies the store, `appHandle` supplies the app.
 * Returns the plain path when either is unavailable, which still navigates
 * correctly inside the embed.
 */
export function adminAppHref(
  path: string,
  hostB64: string | undefined,
  appHandle: string | undefined,
): string {
  const normalized = appPath(path);
  if (!hostB64 || !appHandle) return normalized;

  try {
    const host = atob(hostB64);
    if (!host.startsWith("admin.shopify.com/store/")) return normalized;
    return `https://${host}/apps/${appHandle}${normalized}`;
  } catch {
    return normalized;
  }
}

/**
 * In-app link that displays the admin URL but navigates client-side, so the
 * embed never reloads and the browser never shows the app's own host.
 */
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
  const navigate = useNavigate();
  const rootData = useRouteLoaderData("routes/app") as
    | { appHandle?: string }
    | undefined;
  const path = appPath(to);

  // Resolved on the client only: reading App Bridge config during SSR throws.
  const [href, setHref] = useState(path);
  useEffect(() => {
    setHref(adminAppHref(path, shopify.config?.host, rootData?.appHandle));
  }, [path, shopify, rootData?.appHandle]);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    navigate(path);
  }

  return (
    <a href={href} className={className} style={style} onClick={handleClick}>
      {children}
    </a>
  );
}
