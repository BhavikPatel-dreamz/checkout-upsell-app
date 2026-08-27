(function () {
  var GUEST_STORAGE_KEY = "checkout-upsell-guest-key";
  var fired = {};

  function config() {
    return window.CHECKOUT_UPSELL_ACTIVITY || {};
  }

  function trackingAllowed() {
    try {
      var privacy = window.Shopify && window.Shopify.customerPrivacy;
      if (!privacy || typeof privacy.analyticsProcessingAllowed !== "function") return true;
      return privacy.analyticsProcessingAllowed() !== false;
    } catch (_err) {
      return true;
    }
  }

  function getGuestKey() {
    try {
      var stored = sessionStorage.getItem(GUEST_STORAGE_KEY);
      if (stored) return stored;
      var next =
        "guest-" +
        (window.crypto && crypto.randomUUID
          ? crypto.randomUUID()
          : Date.now() + "-" + Math.random().toString(16).slice(2));
      sessionStorage.setItem(GUEST_STORAGE_KEY, next);
      return next;
    } catch (_err) {
      return "guest-" + Date.now();
    }
  }

  function getClientId() {
    try {
      var match = document.cookie.match(/(?:^|; )_shopify_y=([^;]*)/);
      return match ? decodeURIComponent(match[1]) : null;
    } catch (_err) {
      return null;
    }
  }

  function identity() {
    var customerId = config().customerId || null;
    var clientId = getClientId();
    if (customerId) return { customerId: customerId, guestKey: null, clientId: clientId };
    return { customerId: null, guestKey: getGuestKey(), clientId: clientId };
  }

  function post(eventType, extra) {
    if (!trackingAllowed()) return;
    var cfg = config();
    if (!cfg.activityUrl || !cfg.shop) return;
    var key = eventType + ":" + JSON.stringify(extra || {});
    if (fired[key]) return;
    fired[key] = true;
    var id = identity();
    fetch(cfg.activityUrl, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        shop: cfg.shop,
        eventType: eventType,
        consented: true,
        customerId: id.customerId,
        guestKey: id.guestKey,
        clientId: id.clientId,
        productId: extra && extra.productId,
        variantId: extra && extra.variantId,
        collectionId: extra && extra.collectionId,
        query: extra && extra.query,
      }),
    }).catch(function (err) {
      console.error("Upsell activity beacon error:", err);
    });
  }

  function firePageView() {
    var cfg = config();
    var template = String(cfg.template || "");
    if (template.indexOf("product") === 0 && cfg.productId) {
      post("product_viewed", { productId: cfg.productId, variantId: cfg.variantId });
    } else if (template.indexOf("collection") === 0 && cfg.collectionId) {
      post("collection_viewed", { collectionId: cfg.collectionId });
    } else if (template.indexOf("search") === 0 && cfg.query) {
      post("search_submitted", { query: cfg.query });
    }
  }

  function gid(type, value) {
    if (value == null || value === "") return null;
    var text = String(value);
    if (text.indexOf("gid://") === 0) return text;
    var match = text.match(/(\d+)\s*$/);
    return match ? "gid://shopify/" + type + "/" + match[1] : text;
  }

  function hookCartAdd() {
    if (typeof window.fetch !== "function") return;
    var original = window.fetch;
    window.fetch = function () {
      var input = arguments[0];
      var url = typeof input === "string" ? input : input && input.url;
      var result = original.apply(this, arguments);
      if (url && String(url).indexOf("/cart/add") !== -1) {
        result
          .then(function (response) {
            return response.clone().json();
          })
          .then(function (item) {
            var productId = gid("Product", item && (item.product_id || (item.items && item.items[0] && item.items[0].product_id)));
            var variantId = gid(
              "ProductVariant",
              item && (item.variant_id || item.id || (item.items && item.items[0] && (item.items[0].variant_id || item.items[0].id))),
            );
            if (productId) post("product_added_to_cart", { productId: productId, variantId: variantId });
          })
          .catch(function () {});
      }
      return result;
    };
  }

  var attempts = 0;
  function start() {
    if (!config().shop && attempts < 20) {
      attempts += 1;
      setTimeout(start, 50);
      return;
    }
    firePageView();
    hookCartAdd();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  document.addEventListener("visitorConsentCollected", function () {
    fired = {};
    firePageView();
  });
})();
