"use strict";
(() => {
  (function () {
    var GUEST_KEY = "checkout-upsell-guest-key";
    var viewedKeys = {};
    var rootEl = null;
    var wasDrawerOpen = false;
    var hadCartItems = false;
    var P = "cart-drawer-upsell-";

    function byId(name) {
      return document.getElementById(P + name);
    }

    var o = window.CART_DRAWER_UPSELL_CONFIG || {};

    function isDesignMode() {
      return !!(o.designMode || (window.Shopify && window.Shopify.designMode));
    }

    function showEditorPreviewEnabled() {
      return o.editorPreviewEnabled !== false;
    }

    function guestKey() {
      try {
        var existing = sessionStorage.getItem(GUEST_KEY);
        if (existing) return existing;
        var created =
          "guest-" + (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
        sessionStorage.setItem(GUEST_KEY, created);
        return created;
      } catch {
        return "guest-" + Date.now();
      }
    }

    function identity() {
      var customerId = o.customerId || null;
      var clientId = (document.cookie.match(/(?:^|; )_shopify_y=([^;]*)/) || [])[1] || null;
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

    function addDiv(parent, className, text) {
      var el = document.createElement("div");
      el.className = className;
      el.textContent = text || "";
      parent.appendChild(el);
    }

    function findDrawer() {
      return document.querySelector(
        "cart-drawer, cart-drawer-component, theme-drawer#cart-drawer, #cart-drawer, [data-cart-drawer]",
      );
    }

    function placeRoot() {
      var el = rootEl || byId("root");
      var drawer = findDrawer();
      if (!el || !drawer) return el;
      rootEl = el;
      var inner =
        drawer.querySelector(".drawer__inner, .drawer__contents, .cart-drawer__inner") || drawer;
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

    function clearError() {
      var el = byId("error");
      if (el) el.style.display = "none";
    }

    function showError(message) {
      var el = byId("error");
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
          shop: o.shop,
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

    var ITEM_SEL =
      'tr[id^="CartItem-"], tr.cart-items__table-row, .cart-item, [data-cart-item], [ref="cartItemRows[]"]';

    function cartItemNodes(drawer) {
      if (!drawer) return [];
      return Array.prototype.slice.call(drawer.querySelectorAll(ITEM_SEL));
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
      function add(id) {
        if (id && !seen[id]) {
          seen[id] = true;
          ids.push(id);
        }
      }
      cartItemNodes(findDrawer()).forEach(function (node) {
        add(variantIdFromNode(node));
      });
      if (ids.length) return ids;

      var drawer = findDrawer();
      if (!drawer) return ids;
      var container =
        drawer.querySelector(".cart-drawer__items, .cart-drawer__content, .cart-items, .cart-items__wrapper") ||
        drawer;
      container.querySelectorAll("[data-variant-id]").forEach(function (node) {
        add(numericId(node.getAttribute("data-variant-id")));
      });
      return ids;
    }

    function fetchEligible(variantIds) {
      var gids = variantIds.map(toVariantGid);
      var params = new URLSearchParams({
        placement: "cart_drawer",
        displayLocation: "cart_drawer_upsell",
        variantIds: gids.join(","),
      });
      var id = identity();
      if (id.customerId) params.set("customerId", id.customerId);
      if (id.guestKey) params.set("guestKey", id.guestKey);
      if (id.clientId) params.set("clientId", id.clientId);
      return fetch(o.eligibilityUrl + "?" + params.toString(), {
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
      card.className = P + "card";
      if (readOnly) card.classList.add(P + "card--preview");

      var imageUrl = String(offer.imageUrl || "");
      if (imageUrl.indexOf("http") === 0) {
        var img = document.createElement("img");
        img.src = imageUrl;
        img.alt = offer.productTitle || "";
        card.appendChild(img);
      } else {
        var placeholder = document.createElement("div");
        placeholder.className = P + "placeholder-img";
        card.appendChild(placeholder);
      }

      var details = document.createElement("div");
      details.className = P + "details";
      addDiv(details, P + "promo", offer.promotionalTitle || "");
      addDiv(details, P + "product-title", offer.productTitle || "");
      var variant = document.createElement("div");
      variant.className = P + "variant";
      variant.textContent = offer.variantTitle || "";
      if (offer.price) {
        if (offer.variantTitle) variant.textContent += " · ";
        var price = document.createElement("span");
        price.className = P + "price";
        price.textContent = "$" + offer.price;
        variant.appendChild(price);
      }
      details.appendChild(variant);
      card.appendChild(details);

      if (!readOnly) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = P + "btn";
        btn.textContent = o.addToCartLabel || "Add to cart";
        btn.addEventListener("click", function () {
          addOfferToCart(offer, btn);
        });
        details.appendChild(btn);
      } else {
        var badge = document.createElement("div");
        badge.className = P + "preview-badge";
        badge.textContent = o.previewBadgeLabel || "Preview only";
        details.appendChild(badge);
      }
      return card;
    }

    function getEls() {
      var root = placeRoot();
      return {
        root: root,
        heading: byId("heading") || (root && root.querySelector("." + P + "heading")),
        items: byId("items"),
        notice: byId("editor-notice"),
        empty: byId("empty"),
      };
    }

    function renderOffers(offers) {
      var els = getEls();
      if (!els.items || !els.root) return;
      els.items.replaceChildren();
      if (els.heading) els.heading.style.display = "";
      if (els.notice) els.notice.style.display = "none";
      if (els.empty) els.empty.style.display = "none";
      clearError();
      offers.forEach(function (offer) {
        els.items.appendChild(renderOfferCard(offer, { readOnly: false }));
      });
      els.root.style.display = "block";
    }

    function renderEmpty() {
      var els = getEls();
      if (!els.root) return;
      if (els.items) els.items.replaceChildren();
      if (els.heading) els.heading.style.display = "none";
      if (els.notice) els.notice.style.display = "none";
      clearError();
      if (!els.empty) {
        els.empty = document.createElement("div");
        els.empty.id = P + "empty";
        els.empty.className = P + "empty";
        els.root.appendChild(els.empty);
      }
      els.empty.textContent = "Currently this product doesn't have any offer";
      els.empty.style.display = "block";
      els.root.style.display = "block";
    }

    function renderEditorEmptyState(reason) {
      var els = getEls();
      if (!els.root || !els.items) return;

      els.items.replaceChildren();
      if (els.heading) els.heading.style.display = "";
      if (els.empty) els.empty.style.display = "none";
      clearError();

      if (els.notice) {
        els.notice.textContent =
          o.editorPreviewMessage ||
          "Editor preview: no Cart Drawer offer matches. Add a trigger product or create an active Cart Drawer offer.";
        if (reason) els.notice.textContent += " (" + reason + ")";
        els.notice.style.display = "block";
      }

      var previews = Array.isArray(o.previewProducts) && o.previewProducts.length
        ? o.previewProducts
        : [
            { productTitle: "Sample upsell product", variantTitle: "Example variant", price: "19.99" },
            { productTitle: "Another recommended item", price: "24.00" },
          ];

      previews.forEach(function (p) {
        els.items.appendChild(
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
              promotionalTitle: o.previewPromoLabel || "Example offer copy",
            },
            { readOnly: true },
          ),
        );
      });

      els.root.style.display = "block";
      els.root.setAttribute("data-upsell-preview", "theme-editor");
    }

    function addOfferToCart(offer, button) {
      clearError();
      button.disabled = true;
      var original = button.textContent;
      button.replaceChildren();
      var spinner = document.createElement("span");
      spinner.className = P + "spinner";
      button.appendChild(spinner);
      button.appendChild(document.createTextNode("Adding..."));

      var id = identity();
      var properties = {
        _upsell_offer_id: offer.offerId,
        _upsell_product_id: offer.productId,
        _upsell_variant_id: offer.variantId,
      };
      if (id.customerId) properties._upsell_customer_id = id.customerId;
      if (id.guestKey || id.clientId) properties._upsell_guest_key = id.guestKey || id.clientId;

      track(o.clickedUrl, offer);
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
          track(o.addedToCartUrl, offer);
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
              .catch(openDrawerFallback);
          }
          openDrawerFallback();
          return Promise.resolve();
        })
        .then(loadOffers)
        .then(function () {
          return new Promise(function (r) {
            window.setTimeout(r, 150);
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
      if (!o.eligibilityUrl || !o.shop || !root) {
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
              if (!isDesignMode()) track(o.viewedUrl, offer);
            });
            return;
          }
          if (isDesignMode() && showEditorPreviewEnabled()) {
            renderEditorEmptyState("0 eligible offers");
            return;
          }
          renderEmpty();
        })
        .catch(function () {
          if (isDesignMode() && showEditorPreviewEnabled()) {
            renderEditorEmptyState("API error");
            return;
          }
          renderEmpty();
        });
    }

    function scheduleLoad(delay) {
      window.setTimeout(loadOffers, delay || 0);
    }

    function scheduleLoads(delays) {
      delays.forEach(scheduleLoad);
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
        (drawer.querySelector(".drawer__inner, .drawer__contents, .cart-drawer__inner") || drawer);
      if (root && inner && root.parentElement !== inner) scheduleLoad(0);

      var openDialog = drawer ? drawer.querySelector("dialog[open]") : null;
      var isOpen = Boolean(drawer && (drawer.classList.contains("active") || openDialog));
      var hasItems = Boolean(
        drawer && drawer.querySelector(ITEM_SEL + ", [data-variant-id]"),
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
