import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useOutletContext } from "react-router";

type AppOutletContext = {
  appHandle?: string;
};

export function adminAppUrl(
  appHandle: string,
  path: string,
  hostB64?: string | null,
): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (hostB64) {
    try {
      const host = atob(hostB64);
      if (host.startsWith("admin.shopify.com/")) {
        return `https://${host}/apps/${appHandle}${normalized}`;
      }
    } catch {
      // Fall through to the App Bridge protocol URL.
    }
  }
  return `shopify://admin/apps/${appHandle}${normalized}`;
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
  const context = useOutletContext<AppOutletContext | undefined>();
  const appHandle = context?.appHandle || "checkout-upsell-app-36";
  const [href, setHref] = useState(() => adminAppUrl(appHandle, to));

  useEffect(() => {
    setHref(adminAppUrl(appHandle, to, shopify.config?.host));
  }, [appHandle, shopify, to]);

  return (
    <a
      href={href}
      className={className}
      style={style}
      onClick={(event) => {
        event.preventDefault();
        open(adminAppUrl(appHandle, to, shopify.config?.host), "_top");
      }}
    >
      {children}
    </a>
  );
}
