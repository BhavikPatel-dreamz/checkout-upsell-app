"use strict";
(() => {
  (function () {
    var GUEST_KEY = "checkout-upsell-guest-key";
    var viewedKeys = {};
    var rootEl = null;
    var wasDrawerOpen = false;
    var hadCartItems = false;

    function config() {
      return window.CART_DRAWER_UPSELL_CONFIG || {};
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
      var customerId = config().customerId || null;
      var match = null;
      try {
        match = document.cookie.match(/(?:^|; )_shopify_y=([^;]*)/);
      } catch {
        match = null;
      }
      var clientId = match ? decodeURIComponent(match[1]) : null;
      if (customerId) {
        return { customerId: customerId, guestKey: null, clientId: clientId, isGuest: false };
      }
      return { customerId: null, guestKey: guestKey(), clientId: clientId, isGuest: true };
    }

    function numericId(gid) {
      var m = String(gid || "").match(/(\d+)\s*$/);
      return m ? m[1] : String(gid || "");
    }

    function toVariantGid(id) {
      var s = String(id || "");
      return s.indexOf("gid://") === 0 ? s : "gid://shopify/ProductVariant/" + s;
    }

    function escapeHtml(text) {
      return String(text == null ? "" : text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function findDrawer() {
      return (
        document.querySelector("cart-drawer") ||
        document.querySelector("cart-drawer-component") ||
        document.querySelector("theme-drawer#cart-drawer, #cart-drawer, [data-cart-drawer]") ||
        null
      );
    }

    function placeRoot() {
      var el = rootEl || document.getElementById("cart-drawer-upsell-root");
      var drawer = findDrawer();
      if (!el || !drawer) return el;
      rootEl = el;
      var inner =
        drawer.querySelector(".drawer__inner") ||
        drawer.querySelector(".drawer__contents") ||
        drawer.querySelector(".cart-drawer__inner") ||
        drawer;
      var footer = drawer.querySelector(
        ".drawer__footer, .cart-drawer__footer, .cart-drawer__summary",
      );
      var footerParent = footer && inner.contains(footer) && footer.parentNode ? footer.parentNode : null;
      if (footerParent) {
        if (!(el.parentElement === footerParent && el.nextElementSibling === footer)) {
          footerParent.insertBefore(el, footer);
        }
      } else if (el.parentElement !== inner) {
        inner.appendChild(el);
      }
      return el;
    }

    function errorEl() {
      return document.getElementById("cart-drawer-upsell-error");
    }

    function clearError() {
      var el = errorEl();
      if (el) el.style.display = "none";
    }

    function showError(message) {
      var el = errorEl();
      if (!el) return;
      el.textContent = message;
      el.style.display = "block";
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
          isGuest: id.isGuest,
        }),
      }).catch(function () {});
    }

    function cartItemNodes(drawer) {
      if (!drawer) return [];
      return Array.prototype.slice.call(
        drawer.querySelectorAll(
          'tr[id^="CartItem-"], tr.cart-items__table-row, .cart-item, [data-cart-item], [ref="cartItemRows[]"]',
        ),
      );
    }

    function variantIdFromNode(node) {
      var input = node.querySelector(
        "[data-variant-id], [data-quantity-variant-id], input[name='id']",
      );
      if (input) {
        var fromAttr = numericId(
          input.getAttribute("data-variant-id") ||
            input.getAttribute("data-quantity-variant-id") ||
            input.value,
        );
        if (fromAttr) return fromAttr;
      }
      var link = node.querySelector('a[href*="variant="]');
      if (link) {
        var m = link.getAttribute("href").match(/[?&]variant=(\d+)/);
        if (m) return m[1];
      }
      return null;
    }

    function collectVariantIds() {
      var seen = {};
      var ids = [];
      cartItemNodes(findDrawer()).forEach(function (node) {
        var id = variantIdFromNode(node);
        if (id && !seen[id]) {
          seen[id] = true;
          ids.push(id);
        }
      });
      if (ids.length) return ids;

      var drawer = findDrawer();
      if (!drawer) return ids;
      var container =
        drawer.querySelector(".cart-drawer__items, .cart-drawer__content, .cart-items, .cart-items__wrapper") ||
        drawer;
      container.querySelectorAll("[data-variant-id]").forEach(function (node) {
        var id = numericId(node.getAttribute("data-variant-id"));
        if (id && !seen[id]) {
          seen[id] = true;
          ids.push(id);
        }
      });
      return ids;
    }

    function fetchEligible(variantIds) {
      var gids = variantIds.map(toVariantGid);
      var params = new URLSearchParams({
        shop: config().shop || "",
        placement: "cart_drawer",
        displayLocation: "cart_drawer_upsell",
        variantIds: gids.join(","),
      });
      var id = identity();
      if (id.customerId) params.set("customerId", id.customerId);
      if (id.guestKey) params.set("guestKey", id.guestKey);
      if (id.clientId) params.set("clientId", id.clientId);
      return fetch(config().eligibilityUrl + "?" + params.toString(), {
        credentials: "same-origin",
      }).then(function (res) {
        if (!res.ok) throw new Error("eligible request failed");
        return res.json();
      });
    }

    function openDrawerFallback() {
      document.dispatchEvent(new CustomEvent("cart:refresh", { bubbles: true }));
      document.dispatchEvent(new CustomEvent("cart:updated", { bubbles: true }));
      var drawer = findDrawer();
      if (drawer && typeof drawer.open === "function") drawer.open();
    }

    function renderOfferCard(offer, options) {
      var readOnly = options && options.readOnly;
      var card = document.createElement("div");
      card.className = "cart-drawer-upsell-card";
      if (readOnly) card.classList.add("cart-drawer-upsell-card--preview");

      var img = offer.imageUrl
        ? '<img src="' + escapeHtml(offer.imageUrl) + '" alt="' + escapeHtml(offer.productTitle) + '">'
        : '<div class="cart-drawer-upsell-placeholder-img" aria-hidden="true"></div>';

      card.innerHTML =
        img +
        '<div class="cart-drawer-upsell-details">' +
        '<div class="cart-drawer-upsell-promo">' +
        escapeHtml(offer.promotionalTitle || "") +
        "</div>" +
        '<div class="cart-drawer-upsell-product-title">' +
        escapeHtml(offer.productTitle) +
        "</div>" +
        '<div class="cart-drawer-upsell-variant">' +
        escapeHtml(offer.variantTitle || "") +
        (offer.price
          ? ' · <span class="cart-drawer-upsell-price">$' + escapeHtml(offer.price) + "</span>"
          : "") +
        "</div></div>";

      var details = card.querySelector(".cart-drawer-upsell-details");
      if (!readOnly) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cart-drawer-upsell-btn";
        btn.textContent = config().addToCartLabel || "Add to cart";
        btn.addEventListener("click", function () {
          addOfferToCart(offer, btn);
        });
        if (details) details.appendChild(btn);
        else card.appendChild(btn);
      } else {
        var badge = document.createElement("div");
        badge.className = "cart-drawer-upsell-preview-badge";
        badge.textContent = config().previewBadgeLabel || "Preview only";
        if (details) details.appendChild(badge);
        else card.appendChild(badge);
      }
      return card;
    }

    function renderOffers(offers) {
      var items = document.getElementById("cart-drawer-upsell-items");
      var notice = document.getElementById("cart-drawer-upsell-editor-notice");
      var root = placeRoot();
      if (!items || !root) return;
      items.innerHTML = "";
      if (notice) notice.style.display = "none";
      clearError();
      offers.forEach(function (offer) {
        items.appendChild(renderOfferCard(offer, { readOnly: false }));
      });
      root.style.display = "block";
    }

    function renderEditorEmptyState(reason) {
      var root = placeRoot();
      var items = document.getElementById("cart-drawer-upsell-items");
      var notice = document.getElementById("cart-drawer-upsell-editor-notice");
      if (!root || !items) return;

      items.innerHTML = "";
      clearError();

      if (notice) {
        notice.textContent =
          config().editorPreviewMessage ||
          "Editor preview: no Cart Drawer offer matches. Add a trigger product or create an active Cart Drawer offer.";
        if (reason) notice.textContent += " (" + reason + ")";
        notice.style.display = "block";
      }

      var previews = Array.isArray(config().previewProducts) ? config().previewProducts : [];
      if (previews.length === 0) {
        previews = [
          { productTitle: "Sample upsell product", variantTitle: "Example variant", price: "19.99" },
          { productTitle: "Another recommended item", price: "24.00" },
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
      var original = button.textContent;
      button.innerHTML = '<span class="cart-drawer-upsell-spinner"></span>Adding...';

      var id = identity();
      var properties = {
        _upsell_offer_id: offer.offerId,
        _upsell_product_id: offer.productId,
        _upsell_variant_id: offer.variantId,
      };
      if (id.customerId) properties._upsell_customer_id = id.customerId;
      if (id.guestKey || id.clientId) properties._upsell_guest_key = id.guestKey || id.clientId;

      track(config().clickedUrl, offer);
      fetch("/cart/add.js", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: numericId(offer.variantId),
          quantity: 1,
          properties: properties,
        }),
      })
        .then(function (res) {
          if (!res.ok) throw new Error("add to cart failed");
          return res.json();
        })
        .then(function () {
          track(config().addedToCartUrl, offer);
          var drawer = findDrawer();
          if (drawer && typeof drawer.renderContents === "function") {
            return fetch("/cart?sections=cart-drawer,cart-icon-bubble", {
              credentials: "same-origin",
              cache: "no-store",
              headers: { "X-Requested-With": "XMLHttpRequest" },
            })
              .then(function (res) {
                if (!res.ok) throw new Error("drawer refresh failed");
                return res.json();
              })
              .then(function (payload) {
                drawer.renderContents({ sections: payload.sections || payload, id: payload.id });
                if (typeof drawer.open === "function") drawer.open();
              })
              .catch(function () {
                openDrawerFallback();
              });
          }
          openDrawerFallback();
          return Promise.resolve();
        })
        .then(function () {
          return loadOffers();
        })
        .then(function () {
          return new Promise(function (resolve) {
            window.requestAnimationFrame(function () {
              window.requestAnimationFrame(function () {
                window.setTimeout(resolve, 150);
              });
            });
          });
        })
        .catch(function () {
          showError("Could not add this product. Please try again.");
        })
        .then(function () {
          button.disabled = false;
          button.textContent = original;
        });
    }

    function loadOffers() {
      var root = placeRoot();
      var c = config();
      if (!c.eligibilityUrl || !c.shop || !root) {
        if (isDesignMode() && showEditorPreviewEnabled()) {
          renderEditorEmptyState("missing shop / drawer root");
        }
        return;
      }

      if (!findDrawer() && !(isDesignMode() && showEditorPreviewEnabled())) {
        return;
      }

      var variantIds = collectVariantIds();
      if (variantIds.length === 0) {
        if (isDesignMode() && showEditorPreviewEnabled()) {
          renderEditorEmptyState("no cart items in drawer");
          return;
        }
        root.style.display = "none";
        return;
      }

      fetchEligible(variantIds)
        .then(function (data) {
          var offers = (data && data.offers) || [];
          if (offers.length > 0) {
            renderOffers(offers);
            offers.forEach(function (offer) {
              if (viewedKeys[offer.offerId]) return;
              viewedKeys[offer.offerId] = true;
              if (!isDesignMode()) track(config().viewedUrl, offer);
            });
            return;
          }
          if (isDesignMode() && showEditorPreviewEnabled()) {
            renderEditorEmptyState("0 eligible offers");
            return;
          }
          root.style.display = "none";
        })
        .catch(function () {
          if (isDesignMode() && showEditorPreviewEnabled()) {
            renderEditorEmptyState("API error");
            return;
          }
          if (root) root.style.display = "none";
        });
    }

    function scheduleLoad(delay) {
      window.setTimeout(loadOffers, delay || 0);
    }

    function scheduleLoads(delays) {
      delays.forEach(function (d) {
        scheduleLoad(d);
      });
    }

    ["cart:updated", "cart:refresh", "cart:change", "cart:rendered"].forEach(function (evt) {
      document.addEventListener(evt, function () {
        scheduleLoad(50);
      });
    });

    new MutationObserver(function () {
      var root = placeRoot();
      var drawer = findDrawer();
      var inner =
        drawer &&
        (drawer.querySelector(".drawer__inner") ||
          drawer.querySelector(".drawer__contents") ||
          drawer.querySelector(".cart-drawer__inner") ||
          drawer);
      if (root && inner && root.parentElement !== inner) scheduleLoad(0);

      var openDialog = drawer ? drawer.querySelector("dialog[open]") : null;
      var isOpen = Boolean(drawer && (drawer.classList.contains("active") || openDialog));
      var hasItems = Boolean(
        drawer &&
          drawer.querySelector(
            'tr[id^="CartItem-"], tr.cart-items__table-row, .cart-item, [data-cart-item], [ref="cartItemRows[]"], [data-variant-id]',
          ),
      );
      if ((isOpen && !wasDrawerOpen) || (hasItems && !hadCartItems)) {
        scheduleLoads([80, 350, 800]);
      }
      wasDrawerOpen = isOpen;
      hadCartItems = hasItems;
    }).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "open"],
    });

    if (typeof window.fetch === "function") {
      var originalFetch = window.fetch;
      window.fetch = function () {
        var input = arguments[0];
        var url = typeof input === "string" ? input : input && input.url;
        var promise = originalFetch.apply(this, arguments);
        if (url && /\/cart\/(add|change|update|clear)(?:\.js)?(?:\?|$)/.test(String(url))) {
          promise.then(function (res) {
            if (res.ok) scheduleLoads([200, 800, 1400]);
            return res;
          });
        }
        return promise;
      };
    }

    document.addEventListener("click", function (evt) {
      var target =
        evt.target && evt.target.closest
          ? evt.target.closest(
              "#cart-icon-bubble, [aria-controls*=CartDrawer], [href='/cart'], [data-cart-open], [data-drawer*='cart']",
            )
          : null;
      if (target) scheduleLoads([150, 500, 1000]);
    });

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", loadOffers);
    } else {
      loadOffers();
    }
  })();
})();
