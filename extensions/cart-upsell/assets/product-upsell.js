"use strict";
(function () {
  var config = window.PRODUCT_UPSELL_CONFIG || {};
  var guestKeyName = "checkout-upsell-guest-key";
  var viewed = {};
  var seq = 0;
  var lastVariant = null;

  function guestKey() {
    try {
      var stored = sessionStorage.getItem(guestKeyName);
      if (!stored) {
        stored = "guest-" + (crypto.randomUUID ? crypto.randomUUID() : Date.now());
        sessionStorage.setItem(guestKeyName, stored);
      }
      return stored;
    } catch {
      return "guest-" + Date.now();
    }
  }

  function gid(type, value) {
    var raw = String(value || "");
    if (raw.indexOf("gid://") === 0) return raw;
    var match = raw.match(/(\d+)\s*$/);
    return match ? "gid://shopify/" + type + "/" + match[1] : raw;
  }

  function numericId(value) {
    var match = String(value || "").match(/(\d+)\s*$/);
    return match ? match[1] : String(value || "");
  }

  function lineProperties(offer, who) {
    return {
      _upsell_offer_id: offer.offerId,
      _upsell_product_id: offer.productId,
      _upsell_variant_id: offer.variantId,
      _upsell_customer_id: who.customerId || "",
      _upsell_guest_key: who.guestKey || who.clientId || "",
      _upsell_policy: offer.policyType || "none",
      _upsell_policy_value: offer.policyValue == null ? "" : String(offer.policyValue),
      _upsell_max_discount: String(offer.maxDiscountPercent == null ? 15 : offer.maxDiscountPercent),
    };
  }

  function identity() {
    var customerId = config.customerId || null;
    var clientId = (document.cookie.match(/(?:^|; )_shopify_y=([^;]*)/) || [])[1] || null;
    return customerId
      ? { customerId: customerId, guestKey: null, clientId: clientId, isGuest: false }
      : { customerId: null, guestKey: guestKey(), clientId: clientId, isGuest: true };
  }

  function cartJson() {
    return fetch("/cart.js", { credentials: "same-origin" }).then(function (res) {
      if (!res.ok) throw Error("cart.js failed");
      return res.json();
    });
  }

  function track(url, offer, placement) {
    if (!url) return Promise.resolve();
    var who = identity();
    return fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shop: config.shop,
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
      console.error("Product upsell tracking error:", err);
    });
  }

  function selectedVariant() {
    var input = document.querySelector('form[action*="/cart/add"] [name="id"]');
    try {
      var fromQuery = new URLSearchParams(location.search).get("variant");
      if (fromQuery) return gid("ProductVariant", fromQuery);
    } catch {
      /* ignore */
    }
    return input && input.value ? gid("ProductVariant", input.value) : config.variantId;
  }

  function fetchOffers(placement, variantId, requestSeq) {
    var who = identity();
    var params = new URLSearchParams({
      shop: config.shop || "",
      placement: placement,
      displayLocation: placement,
      productIds: config.productId || "",
      variantIds: variantId || "",
    });
    if (who.customerId) params.set("customerId", who.customerId);
    if (who.guestKey) params.set("guestKey", who.guestKey);
    if (who.clientId) params.set("clientId", who.clientId);
    return cartJson()
      .then(function () {
        params.set("excludeProductIds", [config.productId].join(","));
        return fetch(config.eligibilityUrl + "?" + params.toString(), { credentials: "same-origin" });
      })
      .then(function (res) {
        if (!res.ok) throw Error("eligible request failed");
        return res.json();
      })
      .then(function (body) {
        return requestSeq === seq ? body.offers || [] : [];
      });
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showError(message) {
    var el = document.getElementById("product-upsell-error");
    if (el) {
      el.textContent = message;
      el.style.display = "block";
    }
  }

  function openCartDrawer() {
    var drawer = document.querySelector("cart-drawer, [data-cart-drawer], #CartDrawer, .cart-drawer");
    if (drawer && typeof drawer.open === "function") {
      drawer.open();
      return;
    }
    if (drawer && typeof drawer.show === "function") {
      drawer.show();
      return;
    }
    document.dispatchEvent(new CustomEvent("cart-drawer:open", { bubbles: true }));
    document.dispatchEvent(new CustomEvent("drawer:open", { bubbles: true, detail: { drawer: "cart" } }));
  }

  function refreshCartDom() {
    var selectors = [
      "cart-drawer",
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
        if (!res.ok) throw Error("cart refresh failed");
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

  function cardHtml(offer) {
    return (
      (offer.imageUrl
        ? '<img src="' +
          escapeHtml(offer.imageUrl) +
          '" alt="' +
          escapeHtml(offer.productTitle) +
          '" style="width:100%;height:140px;object-fit:cover;border-radius:6px">'
        : "") +
      (offer.promotionalTitle
        ? '<div style="font-size:12px;color:#666;font-weight:600">' + escapeHtml(offer.promotionalTitle) + "</div>"
        : "") +
      '<div style="font-size:14px;font-weight:600">' +
      escapeHtml(offer.productTitle) +
      "</div>" +
      (offer.variantTitle ? '<div style="font-size:12px;color:#666">' + escapeHtml(offer.variantTitle) + "</div>" : "") +
      (offer.price ? '<div style="font-size:13px">$' + escapeHtml(offer.price) + "</div>" : "")
    );
  }

  function bindCard(container, offer, placement, layout) {
    var card = document.createElement("div");
    card.style.cssText =
      layout === "row"
        ? "flex:0 0 180px;scroll-snap-align:start;border:1px solid #eee;border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px"
        : "border:1px solid #eee;border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px;margin-bottom:10px";
    card.innerHTML = cardHtml(offer);
    var add = document.createElement("button");
    add.type = "button";
    add.textContent = config.addToCartLabel || "Add to cart";
    add.style.cssText =
      "margin-top:auto;padding:8px 12px;border:0;border-radius:6px;background:#111;color:#fff;cursor:pointer;font-size:13px";
    add.onclick = function () {
      addToCart(offer, add, placement);
    };
    var view = document.createElement("button");
    view.type = "button";
    view.textContent = config.viewLabel || "View product";
    view.style.cssText =
      "padding:8px 12px;border:1px solid #111;border-radius:6px;background:#fff;color:#111;cursor:pointer;font-size:13px";
    view.onclick = function () {
      if (!offer.productHandle) return;
      track(config.clickedUrl, offer, placement).finally(function () {
        location.href = "/products/" + encodeURIComponent(offer.productHandle) + "?variant=" + numericId(offer.variantId);
      });
    };
    card.appendChild(add);
    card.appendChild(view);
    container.appendChild(card);
  }

  function markViewed(offers, placement) {
    offers.forEach(function (offer) {
      var key = placement + ":" + offer.offerId + ":" + offer.variantId;
      if (viewed[key]) return;
      viewed[key] = true;
      track(config.viewedUrl, offer, placement);
    });
  }

  function renderInline(offers) {
    var root = document.getElementById("product-upsell-root");
    var items = document.getElementById("product-upsell-items");
    if (!root || !items) return;
    items.innerHTML = "";
    offers.forEach(function (offer) {
      bindCard(items, offer, "product_page", "row");
    });
    root.style.display = offers.length ? "block" : "none";
    markViewed(offers, "product_page");
  }

  function ensurePopup() {
    var overlay = document.getElementById("product-upsell-popup");
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "product-upsell-popup";
    overlay.style.cssText =
      "display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;align-items:center;justify-content:center;padding:16px";
    overlay.innerHTML =
      '<div style="background:#fff;max-width:420px;width:100%;border-radius:12px;padding:20px;position:relative">' +
      '<button type="button" id="product-upsell-popup-close" aria-label="Close" style="position:absolute;top:8px;right:10px;border:0;background:none;font-size:22px;cursor:pointer">&times;</button>' +
      "<h3 style=\"margin:0 0 12px 0;font-size:16px\">You might also like</h3>" +
      '<div id="product-upsell-popup-items"></div></div>';
    document.body.appendChild(overlay);
    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) overlay.style.display = "none";
    });
    document.getElementById("product-upsell-popup-close").onclick = function () {
      overlay.style.display = "none";
    };
    return overlay;
  }

  function renderPopup(offers) {
    if (!offers.length) return;
    var overlay = ensurePopup();
    var items = document.getElementById("product-upsell-popup-items");
    items.innerHTML = "";
    offers.forEach(function (offer) {
      bindCard(items, offer, "popup", "stack");
    });
    markViewed(offers, "popup");
    var shown = false;
    function open() {
      if (shown) return;
      shown = true;
      overlay.style.display = "flex";
    }
    document.addEventListener("mouseleave", open, { once: true });
    setTimeout(open, 8000);
  }

  function ensureSidebar() {
    var aside = document.getElementById("product-upsell-sidebar");
    if (aside) return aside;
    aside = document.createElement("aside");
    aside.id = "product-upsell-sidebar";
    aside.style.cssText =
      "display:none;position:fixed;top:72px;right:16px;width:280px;max-height:calc(100vh - 96px);overflow:auto;background:#fff;border:1px solid #e0e0e0;border-radius:12px;padding:16px;z-index:9998;box-shadow:0 8px 24px rgba(0,0,0,.12)";
    aside.innerHTML = "<h3 style=\"margin:0 0 12px 0;font-size:16px\">Recommended</h3><div id=\"product-upsell-sidebar-items\"></div>";
    document.body.appendChild(aside);
    return aside;
  }

  function renderSidebar(offers) {
    var aside = ensureSidebar();
    var items = document.getElementById("product-upsell-sidebar-items");
    if (!items) return;
    items.innerHTML = "";
    offers.forEach(function (offer) {
      bindCard(items, offer, "sidebar", "stack");
    });
    aside.style.display = offers.length ? "block" : "none";
    markViewed(offers, "sidebar");
  }

  function addToCart(offer, button, placement) {
    var who = identity();
    var label = button.textContent;
    button.disabled = true;
    button.textContent = "Adding...";
    fetch("/cart/add.js", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          {
            id: numericId(offer.variantId),
            quantity: 1,
            properties: lineProperties(offer, who),
          },
        ],
      }),
    })
      .then(function (res) {
        if (!res.ok) throw Error("add to cart failed");
        return res.json();
      })
      .then(function () {
        return track(config.clickedUrl, offer, placement).then(function () {
          return track(config.addedToCartUrl, offer, placement);
        });
      })
      .then(function () {
        return cartJson().catch(function () {
          return null;
        }).then(function (cart) {
          return refreshCartDom()
            .catch(function (err) {
              console.error("Product upsell cart refresh error:", err);
            })
            .then(function () {
              document.dispatchEvent(new CustomEvent("cart:refresh", { bubbles: true }));
              document.dispatchEvent(new CustomEvent("cart:updated", { bubbles: true, detail: { cart: cart } }));
              openCartDrawer();
              load();
            });
        });
      })
      .catch(function (err) {
        console.error("Product upsell add error:", err);
        showError("Could not add this product to your cart. Please try again.");
      })
      .then(function () {
        button.disabled = false;
        button.textContent = label;
      });
  }

  function renderSticky(offers, copy) {
    var bar = document.getElementById("product-upsell-sticky");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "product-upsell-sticky";
      bar.style.cssText =
        "display:none;position:fixed;left:0;right:0;bottom:0;z-index:9997;background:#111;color:#fff;padding:12px 16px;box-shadow:0 -4px 16px rgba(0,0,0,.2)";
      bar.innerHTML =
        '<div style="max-width:1100px;margin:0 auto;display:flex;gap:12px;align-items:center;overflow-x:auto">' +
        '<strong id="product-upsell-sticky-title" style="flex:0 0 auto"></strong>' +
        '<div id="product-upsell-sticky-items" style="display:flex;gap:10px"></div></div>';
      document.body.appendChild(bar);
    }
    var title = document.getElementById("product-upsell-sticky-title");
    var items = document.getElementById("product-upsell-sticky-items");
    if (title) title.textContent = (copy && copy.headline) || "Recommended";
    if (!items) return;
    items.innerHTML = "";
    offers.forEach(function (offer) {
      bindCard(items, offer, "sticky", "row");
    });
    bar.style.display = offers.length ? "block" : "none";
    markViewed(offers, "sticky");
  }

  var pageStarted = Date.now();
  var deepestScroll = 0;
  var exitIntent = false;
  var retryTimer = null;

  function identityKey() {
    var who = identity();
    return who.customerId || who.guestKey || who.clientId || "anon";
  }

  function capHoursFor(channel) {
    if (channel === "popup") return Number(config.popupFrequencyHours || 24);
    if (channel === "sidebar" || channel === "sticky") return Number(config.railFrequencyHours || 12);
    return 0;
  }

  function canShowChannel(channel) {
    if (config.enabledChannels && config.enabledChannels.indexOf(channel) === -1) return false;
    var shop = config.shop || "";
    var key = "cu_freq:" + shop + ":" + identityKey() + ":" + channel;
    try {
      if (sessionStorage.getItem(key + ":session") === "1") return false;
    } catch (_err) {}
    var hours = capHoursFor(channel);
    if (hours <= 0) return true;
    try {
      var last = Number(localStorage.getItem(key) || "");
      if (!last) return true;
      return Date.now() - last >= hours * 3600000;
    } catch (_err2) {
      return true;
    }
  }

  function markChannelShown(channel) {
    var shop = config.shop || "";
    var key = "cu_freq:" + shop + ":" + identityKey() + ":" + channel;
    try {
      sessionStorage.setItem(key + ":session", "1");
      localStorage.setItem(key, String(Date.now()));
    } catch (_err) {}
  }

  function scrollDepth() {
    var doc = document.documentElement;
    var max = Math.max(doc.scrollHeight - window.innerHeight, 1);
    return Math.min(1, Math.max(deepestScroll, window.scrollY / max));
  }

  function decideProducts(decision) {
    return (decision.products || []).map(function (row) {
      return {
        offerId: decision.recommendationId || "decide",
        offerName: (decision.copy && decision.copy.headline) || "",
        productId: row.productId,
        variantId: row.variantId,
        productTitle: row.strategy || "Recommended",
        promotionalTitle: decision.copy && decision.copy.headline,
        price: "",
        productHandle: "",
        imageUrl: "",
        policyType: decision.offer && decision.offer.type ? decision.offer.type : "none",
        policyValue: decision.offer && decision.offer.value != null ? decision.offer.value : null,
        maxDiscountPercent: 15,
      };
    }).filter(function (row) {
      return row.variantId;
    });
  }

  function applyDecision(decision, fallbackOffers) {
    if (!decision || !decision.show) {
      if (fallbackOffers && fallbackOffers.inline && fallbackOffers.inline.length) {
        renderInline(fallbackOffers.inline);
      }
      return;
    }
    var channel = (decision.experience && decision.experience.channel) || "product_page";
    if (!canShowChannel(channel)) {
      if (channel !== "product_page" && canShowChannel("product_page") && fallbackOffers && fallbackOffers.inline) {
        renderInline(fallbackOffers.inline);
      }
      return;
    }
    var products = decideProducts(decision);
    var copy = decision.copy || {};
    if (copy.headline) {
      var heading = document.querySelector("#product-upsell-root h3");
      if (heading) heading.textContent = copy.headline;
    }
    if (channel === "popup") {
      renderPopup(products.length ? products : (fallbackOffers.popup || []));
    } else if (channel === "sidebar") {
      renderSidebar(products.length ? products : (fallbackOffers.sidebar || []));
    } else if (channel === "sticky") {
      renderSticky(products.length ? products : (fallbackOffers.inline || []), copy);
    } else {
      renderInline(products.length ? products : (fallbackOffers.inline || []));
    }
    markChannelShown(channel);
  }

  function postDecide(variantId, cartValue) {
    if (!config.decideUrl) return Promise.resolve(null);
    var who = identity();
    var consented = true;
    try {
      var privacy = window.Shopify && window.Shopify.customerPrivacy;
      if (privacy && typeof privacy.analyticsProcessingAllowed === "function") {
        consented = privacy.analyticsProcessingAllowed() !== false;
      }
    } catch (_err) {}
    return fetch(config.decideUrl, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shop: config.shop,
        surface: "product_page",
        productIds: config.productId ? [config.productId] : [],
        variantIds: variantId ? [variantId] : [],
        cartProductIds: config.productId ? [config.productId] : [],
        customerId: who.customerId,
        anonId: who.clientId || who.guestKey,
        sessionId: who.guestKey,
        consented: consented,
        dwellMs: Date.now() - pageStarted,
        scrollDepth: scrollDepth(),
        exitIntent: exitIntent,
        cartValue: cartValue || 0,
      }),
    }).then(function (res) {
      if (!res.ok) throw Error("decide failed");
      return res.json();
    });
  }

  function load() {
    if (!config.shop || !config.productId) return;
    var variantId = selectedVariant();
    if (!variantId) return;
    lastVariant = variantId;
    var requestSeq = ++seq;
    cartJson()
      .catch(function () {
        return { total_price: 0 };
      })
      .then(function (cart) {
        var cartValue = cart && cart.total_price ? Number(cart.total_price) / 100 : 0;
        var eligible = config.eligibilityUrl
          ? Promise.all([
              fetchOffers("product_page", variantId, requestSeq),
              fetchOffers("popup", variantId, requestSeq),
              fetchOffers("sidebar", variantId, requestSeq),
            ])
          : Promise.resolve([[], [], []]);
        return Promise.all([postDecide(variantId, cartValue).catch(function () {
          return null;
        }), eligible]);
      })
      .then(function (pair) {
        if (requestSeq !== seq) return;
        var decision = pair[0];
        var offers = pair[1] || [[], [], []];
        var fallback = { inline: offers[0], popup: offers[1], sidebar: offers[2] };
        if (decision && !decision.show && decision.timing && decision.timing.delayMs > 0 && !retryTimer) {
          retryTimer = setTimeout(function () {
            retryTimer = null;
            load();
          }, Math.min(decision.timing.delayMs, 15000));
        }
        applyDecision(decision, fallback);
      })
      .catch(function (err) {
        if (requestSeq !== seq) return;
        console.error("Product upsell load error:", err);
        var root = document.getElementById("product-upsell-root");
        if (root) root.style.display = "none";
      });
  }

  function onVariantChange() {
    var variantId = selectedVariant();
    if (variantId && variantId !== lastVariant) load();
  }

  window.addEventListener("scroll", function () {
    deepestScroll = Math.max(deepestScroll, scrollDepth());
  }, { passive: true });
  document.addEventListener("mouseout", function (event) {
    if (!event.relatedTarget && event.clientY <= 0) exitIntent = true;
  });
  document.addEventListener("variant:change", onVariantChange);
  document.addEventListener("change", function (event) {
    if (event.target && event.target.name === "id") onVariantChange();
  });
  window.addEventListener("popstate", onVariantChange);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load);
  else load();
})();
