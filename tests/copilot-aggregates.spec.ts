import { describe, expect, it } from "vitest";
import {
  aggregatesHaveForbiddenKeys,
  answerFromAggregates,
  formatAggregatesForPrompt,
  stripForbiddenKeys,
  type CopilotAggregates,
} from "../app/ai/copilot/aggregates";

const sample: CopilotAggregates = {
  shop: "copilot.myshopify.com",
  optimizationGoal: "revenue",
  holdoutPercent: 10,
  maxDiscountPercent: 15,
  offers: { total: 4, active: 1, draft: 3 },
  campaigns: { total: 4, draft: 3, active: 1 },
  incrementality: [
    {
      experimentId: "_",
      surface: "_",
      treatedUsers: 100,
      holdoutUsers: 10,
      treatedOrders: 20,
      holdoutOrders: 1,
      treatedRevenue: 2000,
      holdoutRevenue: 80,
      treatedConversion: 0.2,
      holdoutConversion: 0.1,
      treatedAov: 100,
      holdoutAov: 80,
      incrementalRevenue: 1200,
    },
  ],
  moments: [
    {
      kind: "fbt_lift",
      status: "detected",
      support: 8,
      lift: 2.1,
      expectedImpact: 8.8,
      productId: "gid://shopify/Product/1",
      relatedProductId: "gid://shopify/Product/2",
    },
  ],
};

describe("copilot aggregates (AI-6.2)", () => {
  it("strips identity and event keys before any model prompt", () => {
    const dirty = {
      shop: "x.myshopify.com",
      customerId: "gid://shopify/Customer/1",
      incrementality: [{ incrementalRevenue: 3, sessionId: "sess" }],
      events: [{ email: "a@b.c" }],
    };
    const clean = stripForbiddenKeys(dirty);
    expect(clean).not.toHaveProperty("customerId");
    expect(JSON.stringify(clean)).not.toContain("gid://shopify/Customer");
    expect(JSON.stringify(clean)).not.toContain("a@b.c");
    expect(aggregatesHaveForbiddenKeys(sample)).toBe(false);
    expect(formatAggregatesForPrompt(sample)).toContain("1200");
    expect(formatAggregatesForPrompt(sample)).not.toMatch(/sessionId|customerId|email/i);
  });

  it("answers incrementality and moments from aggregates without an LLM", () => {
    const revenue = answerFromAggregates("What is incremental revenue vs holdout?", sample);
    expect(revenue).toContain("1200.00");
    expect(revenue).toContain("holdout");
    expect(revenue.toLowerCase()).not.toContain("shopper event");

    const moments = answerFromAggregates("Which smart moments have lift?", sample);
    expect(moments).toContain("fbt_lift");
    expect(moments).toContain("draft");
  });
});
