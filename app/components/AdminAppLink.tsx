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
    // Use client-side navigation to let React Router run the loader
    // and render the target route without forcing a full page reload.
    navigate(path);
  }

  return (
    <button type="button" className={className} style={style} onClick={handleClick}>
      {children}
    </button>
  );
}
