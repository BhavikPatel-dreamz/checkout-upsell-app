import { useAppBridge } from "@shopify/app-bridge-react";
import type { CSSProperties, ReactNode } from "react";
import { Link, NavLink } from "react-router";


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
    <Link to={to} className={className} style={style}>
      {children}
    </Link>
    
    
  );
}
