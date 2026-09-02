import type { CSSProperties, ReactNode } from "react";
import { useNavigate } from "react-router";

function appPath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

/**
 * Uses Shopify App Bridge's supported programmatic navigation path. App Bridge
 * updates the top-level Admin URL. React Router is updated first so the app
 * route changes immediately without requiring a browser refresh.
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
  const navigate = useNavigate();
  const path = appPath(to);

  function handleClick() {
    navigate(path);
    window.open(path, "_self");
  }

  return (
    <button type="button" className={className} style={style} onClick={handleClick}>
      {children}
    </button>
  );
}
