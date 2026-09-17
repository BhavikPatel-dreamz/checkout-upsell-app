import { describe, expect, it } from "vitest";
import {
  canShowByFrequency,
  evaluateStoredFrequency,
  FREQUENCY_CAP_HOURS,
  frequencyStorageKey,
  MAX_INTERRUPTIONS_24H,
} from "../app/ai/experience/frequency";

describe("theme frequency cap", () => {
  it("blocks a second popup in the same session", () => {
    expect(
      canShowByFrequency({
        lastShownAt: null,
        sessionShown: true,
        capHours: FREQUENCY_CAP_HOURS.popup,
      }),
    ).toBe(false);
  });

  it("allows popup after the hour cap elapses", () => {
    const now = Date.now();
    expect(
      canShowByFrequency({
        lastShownAt: now - 25 * 3_600_000,
        sessionShown: false,
        capHours: FREQUENCY_CAP_HOURS.popup,
        now,
      }),
    ).toBe(true);
    expect(
      canShowByFrequency({
        lastShownAt: now - 2 * 3_600_000,
        sessionShown: false,
        capHours: FREQUENCY_CAP_HOURS.popup,
        now,
      }),
    ).toBe(false);
    expect(frequencyStorageKey("shop.myshopify.com", "anon-1", "popup")).toContain("popup");
  });

  it("blocks interruptive channels after the 24h budget is spent", () => {
    const now = new Date();
    const blocked = evaluateStoredFrequency({
      channel: "popup",
      interruptiveShownInWindow: MAX_INTERRUPTIONS_24H,
      now,
    });
    expect(blocked.allow).toBe(false);
    expect(blocked.reason).toBe("interruption_budget");

    const cart = evaluateStoredFrequency({
      channel: "cart",
      interruptiveShownInWindow: MAX_INTERRUPTIONS_24H,
      now,
    });
    expect(cart.allow).toBe(true);
  });
});
