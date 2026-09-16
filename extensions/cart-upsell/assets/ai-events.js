(function () {
  if (window.__CU_AI_EVENTS__) return;
  window.__CU_AI_EVENTS__ = true;

  var queue = [];
  var timer = null;
  var wrapped = false;

  function trackingAllowed() {
    try {
      var privacy = window.Shopify && window.Shopify.customerPrivacy;
      if (!privacy || typeof privacy.analyticsProcessingAllowed !== "function") return true;
      return privacy.analyticsProcessingAllowed() !== false;
    } catch (_err) {
      return true;
    }
  }

  function shopDomain() {
    var cfg =
      window.CHECKOUT_UPSELL_ACTIVITY ||
      window.CART_UPSELL_CONFIG ||
      window.CART_DRAWER_UPSELL_CONFIG ||
      window.PRODUCT_UPSELL_CONFIG ||
      {};
    return cfg.shop || null;
  }

  function eventsUrl() {
    var cfg =
      window.CHECKOUT_UPSELL_ACTIVITY ||
      window.CART_UPSELL_CONFIG ||
      window.CART_DRAWER_UPSELL_CONFIG ||
      window.PRODUCT_UPSELL_CONFIG ||
      {};
    if (cfg.eventsUrl) return cfg.eventsUrl;
    return "/apps/checkout-upsell/api/ai/events";
  }

  function identity() {
    var cfg =
      window.CHECKOUT_UPSELL_ACTIVITY ||
      window.CART_UPSELL_CONFIG ||
      window.CART_DRAWER_UPSELL_CONFIG ||
      window.PRODUCT_UPSELL_CONFIG ||
      {};
    var customerId = cfg.customerId || null;
    var clientId = null;
    try {
      var match = document.cookie.match(/(?:^|; )_shopify_y=([^;]*)/);
      clientId = match ? decodeURIComponent(match[1]) : null;
    } catch (_err) {}
    var guestKey = null;
    try {
      guestKey = sessionStorage.getItem("checkout-upsell-guest-key");
    } catch (_err2) {}
    return {
      customerId: customerId,
      sessionId: customerId ? null : guestKey,
      anonId: clientId || guestKey,
    };
  }

  function flush() {
    timer = null;
    if (!queue.length || !trackingAllowed()) {
      queue = [];
      return;
    }
    var shop = shopDomain();
    if (!shop) {
      queue = [];
      return;
    }
    var events = queue.splice(0, 25);
    fetch(eventsUrl(), {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        shop: shop,
        consented: true,
        events: events,
      }),
    }).catch(function () {});
  }

  function enqueue(event) {
    if (!trackingAllowed()) return;
    var id = identity();
    queue.push(
      Object.assign(
        {
          sessionId: id.sessionId,
          customerId: id.customerId,
          anonId: id.anonId,
          occurredAt: new Date().toISOString(),
          surface: "theme_block",
          source: "theme_emitter",
        },
        event,
      ),
    );
    if (queue.length >= 10) {
      flush();
      return;
    }
    if (!timer) timer = window.setTimeout(flush, 80);
  }

  function gid(type, value) {
    if (value == null || value === "") return null;
    var text = String(value);
    if (text.indexOf("gid://") === 0) return text;
    var match = text.match(/(\d+)\s*$/);
    return match ? "gid://shopify/" + type + "/" + match[1] : text;
  }

  function parseBody(init) {
    if (!init || init.body == null) return null;
    if (typeof init.body !== "string") return null;
    try {
      return JSON.parse(init.body);
    } catch (_err) {
      try {
        var params = new URLSearchParams(init.body);
        var obj = {};
        params.forEach(function (value, key) {
          obj[key] = value;
        });
        return obj;
      } catch (_err2) {
        return null;
      }
    }
  }

  function offerNameFromPath(url) {
    if (/\/api\/offers\/viewed(?:\?|$)/.test(url)) return "recommendation_view";
    if (/\/api\/offers\/clicked(?:\?|$)/.test(url)) return "recommendation_click";
    if (/\/api\/offers\/added-to-cart(?:\?|$)/.test(url)) return "recommendation_add";
    return null;
  }

  function enqueueOffer(name, body) {
    if (!body) return;
    enqueue({
      name: name,
      entities: {
        productId: gid("Product", body.productId),
        variantId: gid("ProductVariant", body.variantId),
      },
      attribution: {
        recommendationId: body.offerId || null,
        campaignId: body.offerId || null,
        experienceId: body.placement || null,
      },
    });
  }

  function enqueueCart(url, body) {
    var productId = gid("Product", body && (body.product_id || body.productId));
    var variantId = gid(
      "ProductVariant",
      body && (body.id || body.variant_id || body.variantId),
    );
    var qty = body && body.quantity != null ? Number(body.quantity) : null;
    var name = "add_to_cart";
    if (/\/cart\/change/.test(url)) {
      name = qty === 0 ? "remove_from_cart" : "quantity_change";
    } else if (/\/cart\/update/.test(url) || /\/cart\/clear/.test(url)) {
      name = /\/cart\/clear/.test(url) ? "remove_from_cart" : "quantity_change";
    }
    enqueue({
      name: name,
      entities: {
        productId: productId || undefined,
        variantId: variantId || undefined,
        query: qty != null && !Number.isNaN(qty) ? String(qty) : undefined,
      },
    });
    if (body && body.properties && (body.properties._upsell_offer_id || body.properties.upsell_offer_id)) {
      enqueue({
        name: "recommendation_add",
        entities: { productId: productId || undefined, variantId: variantId || undefined },
        attribution: {
          recommendationId: body.properties._upsell_offer_id || body.properties.upsell_offer_id,
          campaignId: null,
          experienceId: null,
        },
      });
    }
  }

  function wrapFetch() {
    if (wrapped || typeof window.fetch !== "function") return;
    wrapped = true;
    var original = window.fetch;
    window.fetch = function () {
      var input = arguments[0];
      var init = arguments[1] || {};
      var url = typeof input === "string" ? input : input && input.url;
      var result = original.apply(this, arguments);
      var href = String(url || "");
      var offerName = offerNameFromPath(href);
      if (offerName) enqueueOffer(offerName, parseBody(init));
      if (/\/cart\/(add|change|update|clear)(?:\.js)?(?:\?|$)/.test(href)) {
        enqueueCart(href, parseBody(init));
      }
      return result;
    };
  }

  wrapFetch();
  window.addEventListener("pagehide", flush);
  window.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flush();
  });
})();
