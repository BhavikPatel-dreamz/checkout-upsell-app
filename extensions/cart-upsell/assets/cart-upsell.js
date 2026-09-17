(function () {
  var guestKeyName = "checkout-upsell-guest-key";
  var viewed = {};
  var spinCss = document.createElement("style");
  spinCss.textContent = "@keyframes cart-upsell-spin { to { transform: rotate(360deg); } }";
  document.head.appendChild(spinCss);

  function config() {
    return window.CART_UPSELL_CONFIG || {};
  }

  function guestKey() {
    try {
      var stored = sessionStorage.getItem(guestKeyName);
      if (stored) return stored;
      var next = "guest-" + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now());
      sessionStorage.setItem(guestKeyName, next);
      return next;
    } catch (_err) {
      return "guest-" + Date.now();
    }
  }

  function identity() {
    var raw = config().customerId;
    var customerId = raw
      ? String(raw).indexOf("gid://shopify/Customer/") === 0
        ? String(raw)
        : "gid://shopify/Customer/" + raw
      : null;
    var clientId = null;
    try {
      var match = document.cookie.match(/(?:^|; )_shopify_y=([^;]*)/);
      clientId = match ? decodeURIComponent(match[1]) : null;
    } catch (_err) {}
    return customerId
      ? { customerId: customerId, guestKey: null, clientId: clientId, isGuest: false }
      : { customerId: null, guestKey: guestKey(), clientId: clientId, isGuest: true };
  }

  function productGid(id) {
    var value = String(id);
    return value.indexOf("gid://") === 0 ? value : "gid://shopify/Product/" + value;
  }

  function variantGid(id) {
    var value = String(id);
    return value.indexOf("gid://") === 0 ? value : "gid://shopify/ProductVariant/" + value;
  }

  function numericId(value) {
    var match = String(value).match(/(\d+)\s*$/);
    return match ? match[1] : String(value);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function hide() {
    var root = document.getElementById("cart-upsell-root");
    if (root) root.style.display = "none";
  }

  function track(url, offer, placement) {
    if (!url) return Promise.resolve();
    var who = identity();
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shop: config().shop,
        offerId: offer.offerId,
        offerName: offer.offerName,
        productId: offer.productId,
        variantId: offer.variantId,
        placement: placement,
        customerId: who.customerId,
        guestKey: who.guestKey || who.clientId,
        isGuest: who.isGuest,
      }),
    }).catch(function (err) {
      console.error("Cart upsell tracking error:", err);
    });
  }

  function cartJson() {
    return fetch("/cart.js", { credentials: "same-origin" }).then(function (res) {
      if (!res.ok) throw new Error("cart.js failed");
      return res.json();
    });
  }

  function fetchEligible(cart) {
    var cfg = config();
    var productIds = [];
    var variantIds = [];
    (cart.items || []).forEach(function (item) {
      if (item.product_id) productIds.push(productGid(item.product_id));
      if (item.variant_id) variantIds.push(variantGid(item.variant_id));
    });
    var params = new URLSearchParams({
      shop: cfg.shop || "",
      placement: "checkout",
      productIds: productIds.join(","),
      variantIds: variantIds.join(","),
    });
    var who = identity();
    if (who.customerId) params.set("customerId", who.customerId);
    if (who.guestKey) params.set("guestKey", who.guestKey);
    if (who.clientId) params.set("clientId", who.clientId);
    return fetch(cfg.eligibilityUrl + "?" + params.toString(), { credentials: "same-origin" }).then(function (res) {
      if (!res.ok) throw new Error("eligible request failed");
      return res.json();
    });
  }

  function postDecide(cart) {
    var cfg = config();
    var helper = window.CheckoutUpsellDecide;
    if (!helper || !cfg.decideUrl) return Promise.resolve(null);
    var productIds = (cart.items || []).map(function (item) {
      return productGid(item.product_id);
    });
    var variantIds = (cart.items || []).map(function (item) {
      return variantGid(item.variant_id);
    });
    var who = identity();
    return helper.post(cfg.decideUrl, {
      shop: cfg.shop,
      surface: "cart",
      productIds: productIds,
      variantIds: variantIds,
      cartProductIds: productIds,
      customerId: who.customerId,
      anonId: who.clientId || who.guestKey,
      sessionId: who.guestKey,
      consented: helper.consented(),
      cartValue: cart.total_price ? Number(cart.total_price) / 100 : 0,
    }).catch(function (err) {
      console.error("Cart upsell decide error:", err);
      return null;
    });
  }

  function render(offers, headline) {
    var root = document.getElementById("cart-upsell-root");
    var items = document.getElementById("cart-upsell-items");
    var heading = root && root.querySelector("h3");
    if (!items || !root) return;
    if (headline && heading) heading.textContent = headline;
    items.innerHTML = "";
    var label = config().addToCartLabel || "Add to cart";
    offers.forEach(function (offer) {
      var card = document.createElement("div");
      card.style.cssText =
        "flex: 0 0 180px; scroll-snap-align: start; border: 1px solid #eee; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px;";
      card.innerHTML =
        (offer.imageUrl
          ? '<img src="' + escapeHtml(offer.imageUrl) + '" alt="' + escapeHtml(offer.productTitle) + '" style="width:100%;height:140px;object-fit:cover;border-radius:6px;" />'
          : "") +
        (offer.promotionalTitle
          ? '<div style="font-size:12px;color:#666;font-weight:600;">' + escapeHtml(offer.promotionalTitle) + "</div>"
          : "") +
        '<div style="font-size:14px;font-weight:600;">' +
        escapeHtml(offer.productTitle) +
        "</div>" +
        (offer.variantTitle ? '<div style="font-size:12px;color:#666;">' + escapeHtml(offer.variantTitle) + "</div>" : "") +
        (offer.price ? '<div style="font-size:13px;">$' + escapeHtml(offer.price) + "</div>" : "");
      var button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.style.cssText =
        "margin-top:auto;padding:8px 12px;border:0;border-radius:6px;background:#111;color:#fff;cursor:pointer;font-size:13px;";
      button.addEventListener("click", function () {
        addToCart(offer, button);
      });
      card.appendChild(button);
      items.appendChild(card);
    });
    root.style.display = offers.length ? "block" : "none";
  }

  function refreshCartPage() {
    var selectors = [
      "cart-items",
      "#main-cart-items",
      "#main-cart-footer",
      "[data-cart-items]",
      "[data-cart-form]",
      ".cart__items",
      ".cart__footer",
      'form[action="/cart"]',
    ];
    var url = new URL(window.location.href);
    url.searchParams.set("_cart_refresh", Date.now());
    return fetch(url.toString(), {
      credentials: "same-origin",
      cache: "no-store",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    })
      .then(function (res) {
        if (!res.ok) throw new Error("cart page refresh failed");
        return res.text();
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, "text/html");
        selectors.forEach(function (selector) {
          var current = document.querySelector(selector);
          var next = doc.querySelector(selector);
          if (current && next) current.replaceWith(next);
        });
      });
  }

  function addToCart(offer, button) {
    var error = document.getElementById("cart-upsell-error");
    if (error) {
      error.textContent = "";
      error.style.display = "none";
    }
    button.disabled = true;
    button.dataset.originalLabel = button.textContent;
    button.innerHTML =
      '<span style="display:inline-block;width:12px;height:12px;margin-right:6px;border:2px solid rgba(255,255,255,.45);border-top-color:#fff;border-radius:50%;vertical-align:-2px;animation:cart-upsell-spin .7s linear infinite;"></span>Adding...';
    var who = identity();
    fetch("/cart/add.js", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: numericId(offer.variantId),
        quantity: 1,
        properties: {
          _upsell_offer_id: offer.offerId,
          _upsell_product_id: offer.productId,
          _upsell_variant_id: offer.variantId,
          _upsell_customer_id: who.customerId || "",
          _upsell_guest_key: who.guestKey || who.clientId || "",
        },
      }),
    })
      .then(function (res) {
        if (!res.ok) throw new Error("add to cart failed");
        return res.json();
      })
      .then(function () {
        var cfg = config();
        return track(cfg.clickedUrl, offer, "checkout").then(function () {
          return track(cfg.addedToCartUrl, offer, "checkout");
        });
      })
      .then(function () {
        return load();
      })
      .then(function () {
        return cartJson().then(function (cart) {
          return refreshCartPage().then(function () {
            document.dispatchEvent(new CustomEvent("cart:refresh", { bubbles: true }));
            document.dispatchEvent(new CustomEvent("cart:updated", { bubbles: true, detail: { cart: cart } }));
          });
        });
      })
      .catch(function (err) {
        console.error("Cart upsell add error:", err);
        if (error) {
          error.textContent = "Could not add this product to your cart. Please try again.";
          error.style.display = "block";
        }
      })
      .then(function () {
        button.disabled = false;
        button.textContent = button.dataset.originalLabel || "Add to cart";
      });
  }

  function load() {
    var cfg = config();
    if (!cfg.eligibilityUrl || !cfg.shop) {
      hide();
      return Promise.resolve();
    }
    return cartJson()
      .then(function (cart) {
        if (!cart || !cart.items || !cart.items.length) {
          hide();
          return null;
        }
        return Promise.all([fetchEligible(cart), postDecide(cart)]).then(function (pair) {
          var helper = window.CheckoutUpsellDecide;
          var eligible = (pair[0] && pair[0].offers) || [];
          var decision = pair[1];
          var offers = decision && helper ? helper.merge(decision, eligible) : eligible;
          if (!offers.length) {
            hide();
            return;
          }
          render(offers, decision && decision.copy && decision.copy.headline);
          var err = document.getElementById("cart-upsell-error");
          if (err) {
            err.textContent = "";
            err.style.display = "none";
          }
          offers.forEach(function (offer) {
            if (viewed[offer.offerId]) return;
            viewed[offer.offerId] = true;
            track(cfg.viewedUrl, offer, "checkout");
          });
        });
      })
      .catch(function (err) {
        console.error("Cart upsell load error:", err);
        hide();
      });
  }

  ["cart:updated", "cart:refresh", "cart:change"].forEach(function (name) {
    document.addEventListener(name, load);
  });
  if (typeof window.fetch === "function") {
    var originalFetch = window.fetch;
    window.fetch = function () {
      var input = arguments[0];
      var url = typeof input === "string" ? input : input && input.url;
      var pending = originalFetch.apply(this, arguments);
      if (url && /\/cart\/(change|update|clear)(?:\.js)?(?:\?|$)/.test(String(url))) {
        pending.then(function (res) {
          if (res.ok) load();
          return res;
        });
      }
      return pending;
    };
  }
  document.addEventListener("click", function (event) {
    var target = event.target && event.target.closest
      ? event.target.closest('[data-cart-remove], a[href*="/cart/change"], button[name="remove"]')
      : null;
    if (target) setTimeout(load, 500);
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load);
  else load();
})();
