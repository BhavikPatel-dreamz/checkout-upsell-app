import { describe, expect, it } from "vitest";
import {
  computeAbandonRisk,
  RECOVERY_ABANDON_THRESHOLD,
  shouldRecoverInSession,
} from "../app/ai/intent/abandon";
import { inferIntent } from "../app/ai/intent/heuristics";
import { selectExperience } from "../app/ai/experience/select";

const now = new Date("2026-09-17T12:00:00.000Z");

describe("abandon risk and in-session recovery", () => {
  it("scores checkout/ATC without purchase, idle, and popup close; zeros after purchase", () => {
    expect(computeAbandonRisk([], now)).toBe(0);
    expect(
      computeAbandonRisk(
        [{ name: "checkout_started", occurredAt: new Date(now.getTime() - 2 * 3600_000) }],
        now,
      ),
    ).toBeGreaterThan(RECOVERY_ABANDON_THRESHOLD);
    expect(
      computeAbandonRisk(
        [
          { name: "add_to_cart", occurredAt: now },
          { name: "purchase", occurredAt: now },
        ],
        now,
      ),
    ).toBe(0);
  });

  it("flips ABANDONING after idle or remove, not immediately after ATC", () => {
    expect(inferIntent([{ name: "add_to_cart", productId: "p1", occurredAt: now }], now).state).toBe("HIGH_INTENT");
    expect(
      inferIntent(
        [{ name: "add_to_cart", productId: "p1", occurredAt: new Date(now.getTime() - 10 * 60_000) }],
        now,
      ).state,
    ).toBe("ABANDONING");
  });

  it("selects in-session recovery popup when abandoning, not email/SMS", () => {
    expect(shouldRecoverInSession({ abandonRisk: 0.7, intentState: "ABANDONING" })).toBe(true);
    expect(
      selectExperience({
        requestedSurface: "product_page",
        intentState: "ABANDONING",
        abandonRisk: 0.7,
      }),
    ).toMatchObject({
      channel: "popup",
      templateId: "in_session_recovery",
      reason: "in_session_recovery",
    });
    expect(
      selectExperience({
        requestedSurface: "cart",
        intentState: "ABANDONING",
        abandonRisk: 0.7,
      }),
    ).toMatchObject({ channel: "cart", templateId: "in_session_recovery" });
  });
});
