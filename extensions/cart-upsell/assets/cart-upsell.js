"use strict";
(() => {
  (function () {
    var GUEST_KEY = "checkout-upsell-guest-key";
    var viewedKeys = {};
    var spinStyle = document.createElement("style");
    spinStyle.textContent =
      "@keyframes cart-upsell-spin { to { transform: rotate(360deg); } }";
    document.head.appendChild(spinStyle);

    function config() {
      return window.CART_UPSELL_CONFIG || {};
    }

    function isDesignMode() {
      var c = config();
      return !!(c.designMode || (window.Shopify && window.Shopify.designMode));
    }

    function showEditorPreviewEnabled() {
      return config().editorPreviewEnabled !== false;
    }

    function guestKey() {
      try {
        var existing = sessionStorage.getItem(GUEST_KEY);
        if (existing) return existing;
        var created =
          "guest-" +
          (window.crypto && crypto.randomUUID
            ? crypto.randomUUID()
            : Date.now() + "-" + Math.random().toString(16).slice(2));
        sessionStorage.setItem(GUEST_KEY, created);
        return created;
      } catch {
        return "guest-" + Date.now();
      }
    }

    function identity() {
      var raw = config().customerId;
      var customerId =
        raw == null || raw === ""
          ? null
          : String(raw).indexOf("gid://shopify/Customer/") === 0
            ? String(raw)
            : "gid://shopify/Customer/" + raw;
      var clientId = null;
      try {
        var m = document.cookie.match(/(?:^|; )_shopify_y=([^;]*)/);
        clientId = m ? decodeURIComponent(m[1]) : null;
      } catch {
        clientId = null;
      }
      if (customerId) {
        return { customerId: customerId, guestKey: null, clientId: clientId, isGuest: false };
      }
      return { customerId: null, guestKey: guestKey(), clientId: clientId, isGuest: true };
    }

    function toProductGid(id) {
      var s = String(id);
      return s.indexOf("gid://") === 0 ? s : "gid://shopify/Product/" + s;
    }

    function toVariantGid(id) {
      var s = String(id);
      return s.indexOf("gid://") === 0 ? s : "gid://shopify/ProductVariant/" + s;
    }

    function numericId(gid) {
      var m = String(gid).match(/(\d+)\s*$/);
      return m ? m[1] : String(gid);
    }

    function escapeHtml(text) {
      return String(text == null ? "" : text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function clearError() {
      var el = document.getElementById("cart-upsell-error");
      if (!el) return;
      el.textContent = "";
      el.style.display = "none";
    }

    function showError(message) {
      var el = document.getElementById("cart-upsell-error");
      if (!el) return;
      el.textContent = message;
      el.style.display = "block";
    }

    function hideRoot() {
      var root = document.getElementById("cart-upsell-root");
      if (root) root.style.display = "none";
    }

    function showRoot() {
      var root = document.getElementById("cart-upsell-root");
      if (root) root.style.display = "block";
    }

    function track(url, offer, placement) {
      if (!url) return Promise.resolve();
      var shop = config().shop;
      var id = identity();
      return fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop: shop,
          offerId: offer.offerId,
          offerName: offer.offerName,
          productId: offer.productId,
          variantId: offer.variantId,
          placement: placement,
          customerId: id.customerId,
          guestKey: id.guestKey || id.clientId,
          isGuest: id.isGuest,
        }),
      }).catch(function (err) {
        console.error("Cart upsell tracking error:", err);
      });
    }

    function fetchCart() {
      return fetch("/cart.js", { credentials: "same-origin" }).then(function (res) {
        if (!res.ok) throw new Error("cart.js failed");
        return res.json();
      });
    }

    function refreshCartSections() {
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
          for (var i = 0; i < selectors.length; i++) {
            var current = document.querySelector(selectors[i]);
            var next = doc.querySelector(selectors[i]);
            if (current && next) current.replaceWith(next);
          }
        });
    }

    function fetchEligible(cart) {
      var c = config();
      var items = cart.items || [];
      var productIds = [];
      var variantIds = [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].product_id) productIds.push(toProductGid(items[i].product_id));
        if (items[i].variant_id) variantIds.push(toVariantGid(items[i].variant_id));
      }
      var params = new URLSearchParams({
        shop: c.shop || "",
        placement: "checkout",
        productIds: productIds.join(","),
        variantIds: variantIds.join(","),
      });
      var id = identity();
      if (id.customerId) params.set("customerId", id.customerId);
      if (id.guestKey) params.set("guestKey", id.guestKey);
      if (id.clientId) params.set("clientId", id.clientId);
      return fetch(c.eligibilityUrl + "?" + params.toString(), { credentials: "same-origin" }).then(
        function (res) {
          if (!res.ok) throw new Error("eligible request failed");
          return res.json();
        },
      );
    }

    function renderOfferCard(offer, options) {
      var readOnly = options && options.readOnly;
      var card = document.createElement("div");
      card.className = "cart-upsell-card";
      if (readOnly) card.classList.add("cart-upsell-card--preview");

      card.innerHTML =
        (offer.imageUrl
          ? '<img src="' + escapeHtml(offer.imageUrl) + '" alt="' + escapeHtml(offer.productTitle) + '" />'
          : '<div class="cart-upsell-placeholder-img" aria-hidden="true"></div>') +
        (offer.promotionalTitle
          ? '<div class="cart-upsell-promo">' + escapeHtml(offer.promotionalTitle) + "</div>"
          : "") +
        '<div class="cart-upsell-product-title">' +
        escapeHtml(offer.productTitle) +
        "</div>" +
        (offer.variantTitle
          ? '<div class="cart-upsell-variant">' + escapeHtml(offer.variantTitle) + "</div>"
          : "") +
        (offer.price ? '<div class="cart-upsell-price">$' + escapeHtml(offer.price) + "</div>" : "");

      if (!readOnly) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = config().addToCartLabel || "Add to cart";
        btn.className = "cart-upsell-add-btn";
        btn.addEventListener("click", function () {
          addOfferToCart(offer, btn);
        });
        card.appendChild(btn);
      } else {
        var badge = document.createElement("div");
        badge.className = "cart-upsell-preview-badge";
        badge.textContent = config().previewBadgeLabel || "Preview only";
        card.appendChild(badge);
      }
      return card;
    }

    function renderOffers(offers) {
      var items = document.getElementById("cart-upsell-items");
      var notice = document.getElementById("cart-upsell-editor-notice");
      if (!items) return;
      items.innerHTML = "";
      if (notice) notice.style.display = "none";
      clearError();
      offers.forEach(function (offer) {
        items.appendChild(renderOfferCard(offer, { readOnly: false }));
      });
      showRoot();
    }

    function renderEditorEmptyState(reason) {
      var root = document.getElementById("cart-upsell-root");
      var items = document.getElementById("cart-upsell-items");
      var notice = document.getElementById("cart-upsell-editor-notice");
      if (!root || !items) return;

      items.innerHTML = "";
      clearError();

      if (notice) {
        notice.textContent =
          config().editorPreviewMessage ||
          "Theme editor preview: no active Cart/Checkout offer matches the current cart. Add a trigger product to the cart, or create an active offer with display location Checkout.";
        if (reason) notice.textContent += " (" + reason + ")";
        notice.style.display = "block";
      }

      var previews = Array.isArray(config().previewProducts) ? config().previewProducts : [];
      if (previews.length === 0) {
        previews = [
          {
            productTitle: "Sample upsell product",
            variantTitle: "Example variant",
            price: "19.99",
          },
          {
            productTitle: "Another recommended item",
            price: "24.00",
          },
        ];
      }

      previews.forEach(function (p) {
        items.appendChild(
          renderOfferCard(
            {
              offerId: "preview",
              offerName: "Preview",
              productId: p.productId || "",
              variantId: p.variantId || "",
              productTitle: p.productTitle || p.title || "Preview product",
              variantTitle: p.variantTitle || null,
              imageUrl: p.imageUrl || p.featured_image || null,
              price: p.price != null ? String(p.price) : null,
              promotionalTitle: config().previewPromoLabel || "Example offer copy",
            },
            { readOnly: true },
          ),
        );
      });

      root.style.display = "block";
      root.setAttribute("data-upsell-preview", "theme-editor");
    }

    function addOfferToCart(offer, button) {
      clearError();
      button.disabled = true;
      button.dataset.originalLabel = button.textContent;
      button.innerHTML =
        '<span style="display:inline-block;width:12px;height:12px;margin-right:6px;border:2px solid rgba(255,255,255,.45);border-top-color:#fff;border-radius:50%;vertical-align:-2px;animation:cart-upsell-spin .7s linear infinite;"></span>Adding...';

      var id = identity();
      var payload = {
        id: numericId(offer.variantId),
        quantity: 1,
        properties: {
          _upsell_offer_id: offer.offerId,
          _upsell_product_id: offer.productId,
          _upsell_variant_id: offer.variantId,
          _upsell_customer_id: id.customerId || "",
          _upsell_guest_key: id.guestKey || id.clientId || "",
        },
      };

      fetch("/cart/add.js", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (res) {
          if (!res.ok) throw new Error("add to cart failed");
          return res.json();
        })
        .then(function () {
          var c = config();
          return track(c.clickedUrl, offer, "checkout").then(function () {
            return track(c.addedToCartUrl, offer, "checkout");
          });
        })
        .then(function () {
          return loadOffers();
        })
        .then(function () {
          return fetchCart().then(function (cart) {
            return refreshCartSections().then(function () {
              document.dispatchEvent(new CustomEvent("cart:refresh", { bubbles: true }));
              document.dispatchEvent(
                new CustomEvent("cart:updated", { bubbles: true, detail: { cart: cart } }),
              );
            });
          });
        })
        .catch(function (err) {
          console.error("Cart upsell add error:", err);
          showError("Could not add this product to your cart. Please try again.");
        })
        .then(function () {
          button.disabled = false;
          button.textContent = button.dataset.originalLabel || "Add to cart";
        });
    }

    function loadOffers() {
      var c = config();
      if (!c.eligibilityUrl || !c.shop) {
        if (isDesignMode() && showEditorPreviewEnabled()) {
          renderEditorEmptyState("missing shop / API config");
          return;
        }
        hideRoot();
        return;
      }

      return fetchCart()
        .then(function (cart) {
          if (!cart || !cart.items || cart.items.length === 0) {
            if (isDesignMode() && showEditorPreviewEnabled()) {
              renderEditorEmptyState("cart is empty");
              return null;
            }
            hideRoot();
            return null;
          }
          return fetchEligible(cart);
        })
        .then(function (data) {
          if (!data) return;
          var offers = data.offers || [];
          if (offers.length > 0) {
            renderOffers(offers);
            clearError();
            var c2 = config();
            offers.forEach(function (offer) {
              if (viewedKeys[offer.offerId]) return;
              viewedKeys[offer.offerId] = true;
              if (!isDesignMode()) track(c2.viewedUrl, offer, "checkout");
            });
            return;
          }
          if (isDesignMode() && showEditorPreviewEnabled()) {
            renderEditorEmptyState("0 eligible offers");
            return;
          }
          hideRoot();
        })
        .catch(function (err) {
          console.error("Cart upsell load error:", err);
          if (isDesignMode() && showEditorPreviewEnabled()) {
            renderEditorEmptyState("API error — check app proxy / offers");
            return;
          }
          hideRoot();
        });
    }

    ["cart:updated", "cart:refresh", "cart:change"].forEach(function (evt) {
      document.addEventListener(evt, loadOffers);
    });

    if (typeof window.fetch === "function") {
      var originalFetch = window.fetch;
      window.fetch = function () {
        var input = arguments[0];
        var url = typeof input === "string" ? input : input && input.url;
        var promise = originalFetch.apply(this, arguments);
        if (url && /\/cart\/(change|update|clear)(?:\.js)?(?:\?|$)/.test(String(url))) {
          promise.then(function (res) {
            if (res.ok) loadOffers();
            return res;
          });
        }
        return promise;
      };
      document.addEventListener("click", function (evt) {
        var target = evt.target && evt.target.closest
          ? evt.target.closest('[data-cart-remove], a[href*="/cart/change"], button[name="remove"]')
          : null;
        if (target) setTimeout(loadOffers, 500);
      });
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", loadOffers);
    } else {
      loadOffers();
    }
  })();
})();
