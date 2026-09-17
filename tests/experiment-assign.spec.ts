import { describe, expect, it } from "vitest";
import { pickAbVariantId } from "../app/ai/experiment/assign";

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
