import { describe, expect, it } from "vitest";
import { isGdprTopic, summarizeGdprPayload } from "../app/models/gdpr.server";

describe("GDPR payload summary", () => {
  it("keeps the customer id and drops email and phone", () => {
    const summary = summarizeGdprPayload({
      shop_id: 1,
      shop_domain: "example.myshopify.com",
      customer: { id: 42, email: "person@example.com", phone: "555" },
      orders_to_redact: [100, 101],
    });

    expect(summary.customerId).toBe("42");
    expect(summary.customerIdVariants).toEqual(["42", "gid://shopify/Customer/42"]);
    expect(summary.orderIds).toEqual(["100", "101"]);
    expect(JSON.stringify(summary)).not.toContain("person@example.com");
    expect(JSON.stringify(summary)).not.toContain("555");
  });

  it("recognizes the three mandatory topics", () => {
    expect(isGdprTopic("customers/data_request")).toBe(true);
    expect(isGdprTopic("customers/redact")).toBe(true);
    expect(isGdprTopic("shop/redact")).toBe(true);
    expect(isGdprTopic("orders/paid")).toBe(false);
  });
});
