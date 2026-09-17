import { describe, expect, it } from "vitest";
import { canShowByFrequency, FREQUENCY_CAP_HOURS, frequencyStorageKey } from "../app/ai/experience/frequency";

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
});
