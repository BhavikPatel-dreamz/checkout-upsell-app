export const RECOVERY_ABANDON_THRESHOLD = 0.55;
export const ABANDON_IDLE_HOURS = 0.08; // ~5 minutes after cart/checkout without purchase

export interface AbandonEventLike {
  name: string;
  occurredAt: Date;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(1, value);
}

/**
 * In-session abandon risk (0–1). No email/SMS. Purchases in-window zero the score.
 */
export function computeAbandonRisk(events: AbandonEventLike[], now = new Date()): number {
  let atc = 0;
  let removes = 0;
  let cartViews = 0;
  let checkoutStarts = 0;
  let purchases = 0;
  let popupCloses = 0;
  let lastCommerce = 0;

  for (const event of events) {
    const at = event.occurredAt.getTime();
    switch (event.name) {
      case "add_to_cart":
      case "recommendation_add":
        atc += 1;
        if (at > lastCommerce) lastCommerce = at;
        break;
      case "remove_from_cart":
        removes += 1;
        break;
      case "cart_view":
        cartViews += 1;
        break;
      case "checkout_started":
        checkoutStarts += 1;
        if (at > lastCommerce) lastCommerce = at;
        break;
      case "purchase":
      case "checkout_completed":
      case "recommendation_purchase":
        purchases += 1;
        break;
      case "popup_close":
        popupCloses += 1;
        break;
      default:
        break;
    }
  }

  if (purchases > 0) return 0;

  const idleHours = lastCommerce ? (now.getTime() - lastCommerce) / 3_600_000 : 0;
  const idleLift = lastCommerce ? Math.min(idleHours / 2, 0.28) : 0;

  return clamp01(
    (checkoutStarts > 0 ? 0.4 : 0) +
      (atc > 0 ? 0.22 : 0) +
      removes * 0.18 +
      (cartViews > 0 && checkoutStarts === 0 ? 0.08 : 0) +
      (popupCloses > 0 ? 0.1 : 0) +
      idleLift,
  );
}

export function shouldRecoverInSession(input: {
  abandonRisk: number;
  intentState?: string;
  exitIntent?: boolean | null;
}): boolean {
  if (input.intentState === "ABANDONING") return true;
  return Boolean(input.exitIntent) && input.abandonRisk >= 0.2;
}
