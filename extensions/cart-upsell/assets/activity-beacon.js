(function () {
  var GUEST_STORAGE_KEY = "checkout-upsell-guest-key";
  var TIME_BUCKETS_MS = [15000, 45000, 90000];
  var fired = {};
  var lastVariantId = null;
  var pageStartedAt = Date.now();
  var timeBucketIndex = 0;

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

  function persistGuestKey(next) {
    try {
      sessionStorage.setItem(GUEST_STORAGE_KEY, next);
    } catch (_err) {}
    try {
      document.cookie =
        GUEST_STORAGE_KEY +
        "=" +
        encodeURIComponent(next) +
        "; path=/; max-age=2592000; SameSite=Lax";
    } catch (_err2) {}
  }

  function getGuestKey() {
    try {
      var stored = sessionStorage.getItem(GUEST_STORAGE_KEY);
      if (stored) {
        persistGuestKey(stored);
        return stored;
      }
    } catch (_err) {}
    var next =
      "guest-" +
      (window.crypto && crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now() + "-" + Math.random().toString(16).slice(2));
    persistGuestKey(next);
    return next;
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
        occurredAt: new Date().toISOString(),
      }),
    }).catch(function (err) {
      console.error("Upsell activity beacon error:", err);
    });
  }

  function firePageView() {
    var cfg = config();
    var template = String(cfg.template || "");
    if (template.indexOf("product") === 0 && cfg.productId) {
      lastVariantId = cfg.variantId || null;
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

  function currentVariantId() {
    var cfg = config();
    try {
      var params = new URLSearchParams(window.location.search);
      var fromUrl = params.get("variant");
      if (fromUrl) return gid("ProductVariant", fromUrl);
    } catch (_err) {}
    return cfg.variantId || null;
  }

  function maybeVariantChanged() {
    var cfg = config();
    if (String(cfg.template || "").indexOf("product") !== 0 || !cfg.productId) return;
    var next = currentVariantId();
    if (!next || next === lastVariantId) return;
    lastVariantId = next;
    post("variant_changed", { productId: cfg.productId, variantId: next });
  }

  function tickTimeOnPage() {
    var cfg = config();
    if (String(cfg.template || "").indexOf("product") !== 0 || !cfg.productId) return;
    if (!trackingAllowed()) return;
    var elapsed = Date.now() - pageStartedAt;
    while (timeBucketIndex < TIME_BUCKETS_MS.length && elapsed >= TIME_BUCKETS_MS[timeBucketIndex]) {
      var seconds = Math.round(TIME_BUCKETS_MS[timeBucketIndex] / 1000);
      post("time_on_page", {
        productId: cfg.productId,
        variantId: lastVariantId || cfg.variantId,
        query: String(seconds),
      });
      timeBucketIndex += 1;
    }
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
    setInterval(function () {
      maybeVariantChanged();
      tickTimeOnPage();
    }, 2000);
    window.addEventListener("popstate", maybeVariantChanged);
    document.addEventListener("change", maybeVariantChanged, true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  document.addEventListener("visitorConsentCollected", function () {
    fired = {};
    timeBucketIndex = 0;
    pageStartedAt = Date.now();
    firePageView();
  });
})();
