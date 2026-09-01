import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { useNavigate } from "react-router";

function appPath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function adminHrefForPath(path: string): string {
  const normalized = appPath(path);
  if (typeof document === "undefined") return normalized;
  try {
    const match = document.referrer.match(
      /^(https:\/\/admin\.shopify\.com\/store\/[^/]+\/apps\/[^/]+)/,
    );
    if (match) return `${match[1]}${normalized}`;
  } catch {
    // Stay on the in-app path when the admin referrer is unavailable.
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
  const navigate = useNavigate();
  const path = appPath(to);

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
    const navigateEvent = new CustomEvent("shopify:navigate", {
      bubbles: true,
      cancelable: true,
      detail: { url: path },
    });
    event.currentTarget.dispatchEvent(navigateEvent);
    if (navigateEvent.defaultPrevented) return;
    navigate(path);
  }

  return (
    <a href={adminHrefForPath(path)} className={className} style={style} onClick={handleClick}>
      {children}
    </a>
  );
}
