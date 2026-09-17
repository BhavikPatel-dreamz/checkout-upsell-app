import type { DecideSurface } from "../decide/contract";
import type { TimingTrigger } from "../timing/timing";
import { shouldRecoverInSession } from "../intent/abandon";
import {
  inferAbandonReason,
  recoveryTemplateForReason,
  RECOVERY_COPY,
  type AbandonReason,
} from "../offer/recoveryReason";

export const EXPERIENCE_TEMPLATES = [
  "default",
  "soft_recs",
  "complete_the_setup",
  "wait_you_forgot",
  "in_session_recovery",
  "recovery_reminder",
  "recovery_free_ship",
  "recovery_accessory",
  "welcome_back",
  "post_purchase",
  "checkout_inline",
] as const;

export type ExperienceTemplateId = (typeof EXPERIENCE_TEMPLATES)[number];

export interface ExperienceSelection {
  channel: DecideSurface;
  templateId: ExperienceTemplateId;
  headline: string;
  cta: string;
  reason: string;
}

const COPY: Record<ExperienceTemplateId, { headline: string; cta: string }> = {
  default: { headline: "", cta: "" },
  soft_recs: { headline: "You might also like", cta: "See more" },
  complete_the_setup: { headline: "Complete your setup", cta: "Add to cart" },
  wait_you_forgot: { headline: "Wait — you forgot this", cta: "Add before you go" },
  in_session_recovery: { headline: "Still thinking it over?", cta: "Return to cart" },
  recovery_reminder: RECOVERY_COPY.forgot,
  recovery_free_ship: RECOVERY_COPY.price,
  recovery_accessory: RECOVERY_COPY.accessory,
  welcome_back: { headline: "Welcome back", cta: "Continue" },
  post_purchase: { headline: "Add to your order", cta: "Add now" },
  checkout_inline: { headline: "Recommended with your order", cta: "Add" },
};

function templateForIntent(state: string): ExperienceTemplateId {
  switch (state) {
    case "ABANDONING":
      return "wait_you_forgot";
    case "RETURNING":
    case "LOYAL":
      return "welcome_back";
    case "HIGH_INTENT":
    case "READY_TO_BUY":
      return "complete_the_setup";
    default:
      return "soft_recs";
  }
}

function withCopy(
  channel: DecideSurface,
  templateId: ExperienceTemplateId,
  reason: string,
): ExperienceSelection {
  const copy = COPY[templateId];
  return { channel, templateId, headline: copy.headline, cta: copy.cta, reason };
}

/**
 * Pick inline PDP vs popup vs cart vs thank-you (plus sidebar/checkout when requested).
 * Campaign/Experience rows are AI-3.5; this is the Standard heuristic only.
 */
export function selectExperience(input: {
  requestedSurface: DecideSurface;
  intentState: string;
  timingTrigger?: TimingTrigger | string | null;
  exitIntent?: boolean | null;
  abandonRisk?: number | null;
  abandonReason?: AbandonReason | null;
  priceSensitivity?: number | null;
  discountSensitivity?: number | null;
  strategies?: string[];
  cartValue?: number | null;
}): ExperienceSelection {
  const requested = input.requestedSurface;
  const exit = Boolean(input.exitIntent) || input.timingTrigger === "exit";
  const intentTemplate = templateForIntent(input.intentState);
  const recover = shouldRecoverInSession({
    abandonRisk: input.abandonRisk ?? 0,
    intentState: input.intentState,
    exitIntent: exit,
  });
  const abandonReason =
    input.abandonReason ??
    inferAbandonReason({
      priceSensitivity: input.priceSensitivity,
      discountSensitivity: input.discountSensitivity,
      strategies: input.strategies,
      cartValue: input.cartValue,
    });
  const recoveryTemplate = recoveryTemplateForReason(abandonReason);

  if (requested === "cart") {
    return withCopy(
      "cart",
      recover ? recoveryTemplate : "complete_the_setup",
      recover ? `recovery_${abandonReason}` : "requested_cart",
    );
  }
  if (requested === "thank_you") {
    return withCopy("thank_you", "post_purchase", "requested_thank_you");
  }
  if (requested === "checkout") {
    return withCopy("checkout", "checkout_inline", "requested_checkout");
  }

  if (recover && (requested === "product_page" || requested === "popup" || requested === "sticky" || requested === "sidebar")) {
    return withCopy("popup", recoveryTemplate, exit ? `exit_recovery_${abandonReason}` : `recovery_${abandonReason}`);
  }

  if (exit || (input.intentState === "ABANDONING" && requested === "popup")) {
    return withCopy("popup", "wait_you_forgot", exit ? "exit_intent" : "abandoning");
  }

  if (requested === "popup") {
    return withCopy("popup", intentTemplate, "requested_popup");
  }

  if (requested === "sticky") {
    return withCopy("sticky", intentTemplate, "requested_sticky");
  }

  if (requested === "sidebar") {
    return withCopy("sidebar", intentTemplate, "requested_sidebar");
  }

  if (input.timingTrigger === "scroll") {
    return withCopy("sticky", intentTemplate, "scroll");
  }

  return withCopy("product_page", intentTemplate, "inline_pdp");
}

/** Prefer inline when an interruptive channel fails the timing EV gate. */
export function fallbackExperience(selection: ExperienceSelection): ExperienceSelection | null {
  if (selection.channel !== "popup" && selection.channel !== "sidebar" && selection.channel !== "sticky") {
    return null;
  }
  return withCopy(
    "product_page",
    selection.templateId === "wait_you_forgot" ||
      selection.templateId === "in_session_recovery" ||
      selection.templateId === "recovery_reminder" ||
      selection.templateId === "recovery_free_ship" ||
      selection.templateId === "recovery_accessory"
      ? "soft_recs"
      : selection.templateId,
    "fallback_inline",
  );
}
