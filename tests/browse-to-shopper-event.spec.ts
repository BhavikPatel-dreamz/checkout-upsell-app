import { BrowseActivityType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { browseActivityToShopperCreateData } from "../app/ai/events/fromBrowseActivity";

describe("browse activity to shopper event mapping", () => {
  it("maps product_viewed onto a persistable ShopperEvent row", () => {
    const row = browseActivityToShopperCreateData({
      shop: "example.myshopify.com",
      eventId: "browse-1",
      eventType: BrowseActivityType.product_viewed,
      occurredAt: new Date("2026-09-16T10:00:00.000Z"),
      customerId: null,
      guestKey: null,
      clientId: "client-1",
      productId: "gid://shopify/Product/1",
      variantId: null,
      collectionId: null,
      query: null,
    });
    expect(row?.name).toBe("product_view");
    expect(row?.anonId).toBe("client-1");
    expect(row?.surface).toBe("pixel");
    expect(row?.productId).toBe("gid://shopify/Product/1");
  });

  it("does not map time_on_page (no Phase 1 envelope name)", () => {
    const row = browseActivityToShopperCreateData({
      shop: "example.myshopify.com",
      eventId: "browse-2",
      eventType: BrowseActivityType.time_on_page,
      occurredAt: new Date(),
      customerId: null,
      guestKey: "guest-1",
      clientId: null,
      productId: "gid://shopify/Product/1",
      variantId: null,
      collectionId: null,
      query: "45",
    });
    expect(row).toBeNull();
  });
});
