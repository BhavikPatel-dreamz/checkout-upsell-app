import type { CSSProperties, ReactNode } from "react";

function appPath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

/**
 * In-app link that App Bridge owns, same as `<s-app-nav>` items.
 * Relative href keeps the current admin store + app slug
 * (`.../apps/checkout-upsell-app-36/...`) and avoids the app host URL.
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
  return (
    <s-link href={appPath(to)} className={className} style={style}>
      {children}
    </s-link>
  );
}
