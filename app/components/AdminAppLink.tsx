import type { CSSProperties, ReactNode } from "react";

function appPath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

/**
 * Uses Shopify App Bridge's supported programmatic navigation path. App Bridge
 * turns a same-window app-relative `open()` call into embedded Admin navigation
 * and keeps the parent URL and iframe route in sync.
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
  const path = appPath(to);

  function handleClick() {
    window.open(path, "_self");
  }

  return (
    <button type="button" className={className} style={style} onClick={handleClick}>
      {children}
    </button>
  );
}
