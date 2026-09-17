import { describe, expect, it } from "vitest";
import { pickAbVariantId } from "../app/ai/experiment/assign";
import { banditBetaParams, pickBanditVariantId } from "../app/ai/experiment/bandit";

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

describe("experience variant A/B assignment", () => {
  it("sticks the same identity to the same arm and splits two variants", () => {
    const shop = "ab.myshopify.com";
    const experimentId = "exp-1";
    const ids = ["control", "treatment"];
    const first = pickAbVariantId(shop, experimentId, "anon-1", ids);
    const second = pickAbVariantId(shop, experimentId, "anon-1", ids);
    expect(first).toBe(second);
    expect(ids).toContain(first);

    const other = pickAbVariantId(shop, experimentId, "anon-other-bucket", ids);
    expect(ids).toContain(other);
    expect(pickAbVariantId(shop, experimentId, "x", ["only"])).toBe("only");
    expect(pickAbVariantId(shop, experimentId, "x", [])).toBeNull();
  });
});

describe("experience bandit with holdout retained (AI-5.6)", () => {
  it("never picks a variant for holdout shoppers", () => {
    expect(
      pickBanditVariantId({
        holdout: true,
        variantIds: ["control", "treatment"],
        existingVariantId: "treatment",
        arms: [
          { variantId: "control", trials: 10, successes: 8, rewardSum: 400 },
          { variantId: "treatment", trials: 10, successes: 1, rewardSum: 10 },
        ],
      }),
    ).toBeNull();
  });

  it("keeps a treated assignment sticky", () => {
    expect(
      pickBanditVariantId({
        holdout: false,
        variantIds: ["control", "treatment"],
        existingVariantId: "control",
        random: () => 0.99,
        arms: [
          { variantId: "control", trials: 80, successes: 2, rewardSum: 20 },
          { variantId: "treatment", trials: 80, successes: 70, rewardSum: 900 },
        ],
      }),
    ).toBe("control");
  });

  it("exploits the winning treated arm and ignores empty holdout", () => {
    const arms = [
      { variantId: "lose", trials: 80, successes: 4, rewardSum: 40 },
      { variantId: "win", trials: 80, successes: 60, rewardSum: 900 },
    ];
    let wins = 0;
    for (let i = 0; i < 80; i += 1) {
      const picked = pickBanditVariantId({
        holdout: false,
        variantIds: ["lose", "win"],
        goal: "conversion",
        random: lcg(1000 + i * 17),
        arms,
      });
      if (picked === "win") wins += 1;
    }
    expect(wins).toBeGreaterThan(60);
  });

  it("uses a stronger conversion prior for converting arms", () => {
    const weak = banditBetaParams(
      { variantId: "a", trials: 10, successes: 1, rewardSum: 10 },
      "conversion",
    );
    const strong = banditBetaParams(
      { variantId: "b", trials: 10, successes: 8, rewardSum: 80 },
      "conversion",
    );
    expect(strong.a / (strong.a + strong.b)).toBeGreaterThan(weak.a / (weak.a + weak.b));
  });
});
