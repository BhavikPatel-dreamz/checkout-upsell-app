(function () {
  "use strict";

  var GUEST_STORAGE_KEY = "checkout-upsell-guest-key";
  var viewedOfferIds = {};
  var upsellRootElement = null;
  var drawerWasActive = false;

  var spinnerStyle = document.createElement("style");
  spinnerStyle.textContent = "@keyframes cart-drawer-upsell-spin { to { transform: rotate(360deg); } }";
  document.head.appendChild(spinnerStyle);

  function config() {
    return window.CART_DRAWER_UPSELL_CONFIG || {};
  }

  function guestKey() {
    try {
      var stored = sessionStorage.getItem(GUEST_STORAGE_KEY);
      if (stored) return stored;
      var value = "guest-" + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2));
      sessionStorage.setItem(GUEST_STORAGE_KEY, value);
      return value;
    } catch (_error) {
      return "guest-" + Date.now();
    }
  }

  function identity() {
    var customerId = config().customerId || null;
    var cookie = null;
    try {
      cookie = document.cookie.match(/(?:^|; )_shopify_y=([^;]*)/);
    } catch (_error) {
      cookie = null;
    }
    var clientId = cookie ? decodeURIComponent(cookie[1]) : null;
    return customerId
      ? { customerId: customerId, guestKey: null, clientId: clientId, isGuest: false }
      : { customerId: null, guestKey: guestKey(), clientId: clientId, isGuest: true };
  }

  function gid(type, value) {
    var stringValue = String(value || "");
    if (stringValue.indexOf("gid://") === 0) return stringValue;
    return "gid://shopify/" + type + "/" + stringValue;
  }

  function numericId(value) {
    var match = String(value || "").match(/(\d+)\s*$/);
    return match ? match[1] : String(value || "");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function root() {
    var element = upsellRootElement || document.getElementById("cart-drawer-upsell-root");
    var drawer = document.querySelector("cart-drawer");
    if (!element || !drawer) return element;
    upsellRootElement = element;

    var mount = drawer.querySelector(".drawer__inner") || drawer.querySelector(".drawer__contents") || drawer;
    var footer = drawer.querySelector(".drawer__footer, .cart-drawer__footer");
    if (element.parentElement !== mount) {
      if (footer && footer.parentElement === mount) mount.insertBefore(element, footer);
      else mount.appendChild(element);
    }
    return element;
  }
  function items() { return document.getElementById("cart-drawer-upsell-items"); }
  function errorElement() { return document.getElementById("cart-drawer-upsell-error"); }

  function showError(message) {
    var element = errorElement();
    if (element) {
      element.textContent = message;
      element.style.display = "block";
    }
  }

  function hideError() {
    var element = errorElement();
    if (element) element.style.display = "none";
  }

  function track(url, offer) {
    if (!url) return Promise.resolve();
    var id = identity();
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shop: config().shop,
        offerId: offer.offerId,
        offerName: offer.offerName,
        productId: offer.productId,
        variantId: offer.variantId,
        placement: "cart_drawer",
        customerId: id.customerId,
        guestKey: id.guestKey || id.clientId,
        isGuest: id.isGuest
      })
    }).catch(function (trackingError) {
      console.error("Cart drawer upsell tracking error:", trackingError);
    });
  }

  function cart() {
    return fetch("/cart.js", { credentials: "same-origin" }).then(function (response) {
      if (!response.ok) throw new Error("cart.js failed");
      return response.json();
    });
  }

  function eligible(currentCart) {
    var productIds = [];
    var variantIds = [];
    (currentCart.items || []).forEach(function (item) {
      if (item.product_id) productIds.push(gid("Product", item.product_id));
      if (item.variant_id) variantIds.push(gid("ProductVariant", item.variant_id));
    });
    var query = new URLSearchParams({
      shop: config().shop || "",
      placement: "cart_drawer",
      productIds: productIds.join(","),
      variantIds: variantIds.join(",")
    });
    var id = identity();
    if (id.customerId) query.set("customerId", id.customerId);
    if (id.guestKey) query.set("guestKey", id.guestKey);
    if (id.clientId) query.set("clientId", id.clientId);
    return fetch(config().eligibilityUrl + "?" + query.toString(), { credentials: "same-origin" }).then(function (response) {
      if (!response.ok) throw new Error("eligible request failed");
      return response.json();
    });
  }

  function refreshCart() {
    document.dispatchEvent(new CustomEvent("cart:refresh", { bubbles: true }));
    document.dispatchEvent(new CustomEvent("cart:updated", { bubbles: true }));
    var drawer = document.querySelector("cart-drawer");
    if (drawer && typeof drawer.open === "function") drawer.open();
  }

  function refreshNativeDrawer() {
    var drawer = document.querySelector("cart-drawer");
    if (!drawer || typeof drawer.renderContents !== "function") {
      refreshCart();
      return Promise.resolve();
    }

    return fetch("/cart?sections=cart-drawer,cart-icon-bubble", {
      credentials: "same-origin",
      cache: "no-store",
      headers: { "X-Requested-With": "XMLHttpRequest" }
    })
      .then(function (response) {
        if (!response.ok) throw new Error("drawer refresh failed");
        return response.json();
      })
      .then(function (contents) {
        drawer.renderContents({
          sections: contents.sections || contents,
          id: contents.id
        });
        if (typeof drawer.open === "function") drawer.open();
      })
      .catch(function (refreshError) {
        console.error("Cart drawer refresh error:", refreshError);
        refreshCart();
      });
  }

  function waitForDrawerPaint() {
    return new Promise(function (resolve) {
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
          window.setTimeout(resolve, 150);
        });
      });
    });
  }

  function add(offer, button) {
    hideError();
    button.disabled = true;
    var originalLabel = button.textContent;
    button.innerHTML = '<span style="display:inline-block;width:12px;height:12px;margin-right:6px;border:2px solid rgba(255,255,255,.45);border-top-color:#fff;border-radius:50%;vertical-align:-2px;animation:cart-drawer-upsell-spin .7s linear infinite;"></span>Adding...';
    var id = identity();
    var properties = {
      _upsell_offer_id: offer.offerId,
      _upsell_product_id: offer.productId,
      _upsell_variant_id: offer.variantId
    };
    if (id.customerId) properties._upsell_customer_id = id.customerId;
    if (id.guestKey || id.clientId) properties._upsell_guest_key = id.guestKey || id.clientId;

    void track(config().clickedUrl, offer);
    fetch("/cart/add.js", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: numericId(offer.variantId), quantity: 1, properties: properties })
        })
      .then(function (response) {
        if (!response.ok) throw new Error("add to cart failed");
        return response.json();
      })
      .then(function () {
        void track(config().addedToCartUrl, offer);
        return refreshNativeDrawer();
      })
      .then(function () {
        return load();
      })
      .then(function () {
        return waitForDrawerPaint();
      })
      .catch(function (addError) {
        console.error("Cart drawer upsell add error:", addError);
        showError("Could not add this product to your cart. Please try again.");
      })
      .then(function () {
        button.disabled = false;
        button.textContent = originalLabel;
      });
  }

  function render(offers) {
    var container = items();
    if (!container) return;
    container.innerHTML = "";
    container.style.display = "flex";
    container.style.flexDirection = "row";
    container.style.gap = "12px";
    container.style.overflowX = "auto";
    container.style.overflowY = "hidden";
    container.style.paddingBottom = "8px";
    container.style.scrollSnapType = "x proximity";
    offers.forEach(function (offer) {
      var card = document.createElement("div");
      card.style.cssText = "flex:0 0 300px;box-sizing:border-box;scroll-snap-align:start;display:flex;gap:10px;align-items:flex-start;border:1px solid #eee;border-radius:6px;padding:10px;min-height:150px;";
      var image = offer.imageUrl ? '<img src="' + escapeHtml(offer.imageUrl) + '" alt="' + escapeHtml(offer.productTitle) + '" style="width:64px;height:64px;object-fit:cover;border-radius:4px;flex:none;">' : "";
      var productUrl = offer.productHandle ? "/products/" + encodeURIComponent(offer.productHandle) + "?variant=" + encodeURIComponent(numericId(offer.variantId)) : "";
      var view = productUrl ? '<a href="' + escapeHtml(productUrl) + '" style="font-size:12px;display:block;margin-top:4px;">' + escapeHtml(config().viewLabel || "View product") + "</a>" : "";
      card.innerHTML = image + '<div style="min-width:0;flex:1;"><div style="font-size:12px;color:#666;">' + escapeHtml(offer.promotionalTitle || "") + '</div><div style="font-size:14px;font-weight:600;">' + escapeHtml(offer.productTitle) + '</div><div style="font-size:12px;color:#666;">' + escapeHtml(offer.variantTitle || "") + (offer.price ? " · $" + escapeHtml(offer.price) : "") + '</div>' + view + '</div>';
      var button = document.createElement("button");
      button.type = "button";
      button.textContent = config().addToCartLabel || "Add to cart";
      button.style.cssText = "display:block;margin-top:8px;padding:8px 10px;border:0;border-radius:4px;background:#111;color:#fff;cursor:pointer;font-size:12px;";
      button.addEventListener("click", function () { add(offer, button); });
      var details = card.querySelector("div[style*='min-width:0']");
      if (details) {
        var viewLink = details.querySelector("a");
        details.appendChild(button);
        if (viewLink) details.appendChild(viewLink);
      } else {
        card.appendChild(button);
      }
      container.appendChild(card);
    });
  }

  function load() {
    var upsellRoot = root();
    if (!config().eligibilityUrl || !config().shop || !upsellRoot || !document.querySelector("cart-drawer")) return;
    cart().then(function (currentCart) {
      if (!currentCart.items || currentCart.items.length === 0) {
        upsellRoot.style.display = "none";
        return null;
      }
      return eligible(currentCart);
    }).then(function (data) {
      if (!data) return;
      var offers = data.offers || [];
      if (!offers.length) {
        upsellRoot.style.display = "none";
        return;
      }
      render(offers);
      upsellRoot.style.display = "block";
      offers.forEach(function (offer) {
        if (viewedOfferIds[offer.offerId]) return;
        viewedOfferIds[offer.offerId] = true;
        track(config().viewedUrl, offer);
      });
    }).catch(function (loadError) {
      console.error("Cart drawer upsell load error:", loadError);
      if (upsellRoot) upsellRoot.style.display = "none";
    });
  }

  function scheduleLoad(delay) {
    window.setTimeout(load, delay || 0);
  }

  function scheduleLoads(delays) {
    delays.forEach(function (delay) { scheduleLoad(delay); });
  }

  ["cart:updated", "cart:refresh", "cart:change", "cart:rendered"].forEach(function (eventName) {
    document.addEventListener(eventName, function () { scheduleLoad(50); });
  });
  new MutationObserver(function () {
    var element = root();
    var drawer = document.querySelector("cart-drawer");
    var mount = drawer && (drawer.querySelector(".drawer__inner") || drawer.querySelector(".drawer__contents") || drawer);
    if (element && mount && element.parentElement !== mount) scheduleLoad(0);
    var drawerIsActive = Boolean(drawer && drawer.classList.contains("active"));
    if (drawerIsActive && !drawerWasActive) scheduleLoads([100, 400, 900]);
    drawerWasActive = drawerIsActive;
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "open"] });

  if (typeof window.fetch === "function") {
    var originalFetch = window.fetch;
    window.fetch = function () {
      var request = arguments[0];
      var url = typeof request === "string" ? request : request && request.url;
      var result = originalFetch.apply(this, arguments);
      if (url && /\/cart\/(add|change|update|clear)(?:\.js)?(?:\?|$)/.test(String(url))) {
        result.then(function (response) {
          if (response.ok) {
            scheduleLoads([200, 800, 1400]);
          }
          return response;
        });
      }
      return result;
    };
  }

  document.addEventListener("click", function (event) {
    var target = event.target && event.target.closest
      ? event.target.closest("#cart-icon-bubble, [aria-controls*=CartDrawer], [href='/cart']")
      : null;
    if (target) {
      scheduleLoads([150, 500, 1000]);
    }
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load);
  else load();
})();
