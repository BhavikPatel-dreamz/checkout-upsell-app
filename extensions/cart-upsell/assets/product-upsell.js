"use strict";
(() => {
  (function () {
    var o = window.PRODUCT_UPSELL_CONFIG || {};
    var GUEST_KEY = "checkout-upsell-guest-key";
    var viewedKeys = {};
    var loadGeneration = 0;
    var lastVariantId = null;

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

    function toGid(type, value) {
      var s = String(value || "");
      if (s.indexOf("gid://") === 0) return s;
      var m = s.match(/(\d+)\s*$/);
      return m ? "gid://shopify/" + type + "/" + m[1] : s;
    }

    function numericId(gid) {
      var m = String(gid || "").match(/(\d+)\s*$/);
      return m ? m[1] : String(gid || "");
    }

    function identity() {
      var customerId = o.customerId || null;
      var clientId = (document.cookie.match(/(?:^|; )_shopify_y=([^;]*)/) || [])[1] || null;
      if (customerId) {
        return { customerId: customerId, guestKey: null, clientId: clientId, isGuest: false };
      }
      return { customerId: null, guestKey: guestKey(), clientId: clientId, isGuest: true };
    }

    function fetchCart() {
      return fetch("/cart.js", { credentials: "same-origin" }).then(function (res) {
        if (!res.ok) throw new Error("cart.js failed");
        return res.json();
      });
    }

    function track(url, offer) {
      if (!url) return Promise.resolve();
      var id = identity();
      return fetch(url, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop: o.shop,
          offerId: offer.offerId,
          offerName: offer.offerName,
          productId: offer.productId,
          variantId: offer.variantId,
          placement: "product_page",
          customerId: id.customerId,
          guestKey: id.guestKey || id.clientId,
          isGuest: id.isGuest,
        }),
      }).catch(function (err) {
        console.error("Product upsell tracking error:", err);
      });
    }

    function selectedVariantId() {
      var input = document.querySelector('form[action*="/cart/add"] [name="id"]');
      try {
        var fromUrl = new URLSearchParams(location.search).get("variant");
        if (fromUrl) return toGid("ProductVariant", fromUrl);
      } catch {
        /* ignore */
      }
      if (input && input.value) return toGid("ProductVariant", input.value);
      return o.variantId;
    }

    function fetchEligible(variantId, generation) {
      var id = identity();
      var params = new URLSearchParams({
        shop: o.shop || "",
        placement: "product_page",
        displayLocation: "product_page",
        productIds: o.productId || "",
        variantIds: variantId || "",
      });
      if (id.customerId) params.set("customerId", id.customerId);
      if (id.guestKey) params.set("guestKey", id.guestKey);
      if (id.clientId) params.set("clientId", id.clientId);

      return fetchCart()
        .then(function () {
          params.set("excludeProductIds", [o.productId].join(","));
          return fetch(o.eligibilityUrl + "?" + params.toString(), { credentials: "same-origin" });
        })
        .then(function (res) {
          if (!res.ok) throw new Error("eligible request failed");
          return res.json();
        })
        .then(function (data) {
          return generation === loadGeneration ? data.offers || [] : [];
        });
    }

    function escapeHtml(text) {
      return String(text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function showError(message) {
      var el = document.getElementById("product-upsell-error");
      if (!el) return;
      el.textContent = message;
      el.style.display = "block";
    }

    function hideError() {
      var el = document.getElementById("product-upsell-error");
      if (!el) return;
      el.textContent = "";
      el.style.display = "none";
    }

    function openCartDrawer() {
      var drawer = document.querySelector(
        "cart-drawer, [data-cart-drawer], #CartDrawer, .cart-drawer",
      );
      if (drawer && typeof drawer.open === "function") {
        drawer.open();
        return;
      }
      if (drawer && typeof drawer.show === "function") {
        drawer.show();
        return;
      }
      document.dispatchEvent(new CustomEvent("cart-drawer:open", { bubbles: true }));
      document.dispatchEvent(
        new CustomEvent("drawer:open", { bubbles: true, detail: { drawer: "cart" } }),
      );
    }

    function refreshCartSections() {
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
          if (!res.ok) throw new Error("cart refresh failed");
          return res.text();
        })
        .then(function (html) {
          var doc = new DOMParser().parseFromString(html, "text/html");
          selectors.forEach(function (sel) {
            var current = document.querySelector(sel);
            var next = doc.querySelector(sel);
            if (current && next) current.replaceWith(next);
          });
        });
    }

    function renderOfferCard(offer, options) {
      var readOnly = options && options.readOnly;
      var card = document.createElement("div");
      card.className = "product-upsell-card";
      if (readOnly) card.classList.add("product-upsell-card--preview");

      card.innerHTML =
        (offer.imageUrl
          ? '<img src="' + escapeHtml(offer.imageUrl) + '" alt="' + escapeHtml(offer.productTitle) + '">'
          : '<div class="product-upsell-placeholder-img" aria-hidden="true"></div>') +
        (offer.promotionalTitle
          ? '<div class="product-upsell-promo">' + escapeHtml(offer.promotionalTitle) + "</div>"
          : "") +
        '<div class="product-upsell-product-title">' + escapeHtml(offer.productTitle) + "</div>" +
        (offer.variantTitle
          ? '<div class="product-upsell-variant">' + escapeHtml(offer.variantTitle) + "</div>"
          : "") +
        (offer.price
          ? '<div class="product-upsell-price">$' + escapeHtml(offer.price) + "</div>"
          : "");

      if (!readOnly) {
        var addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.textContent = o.addToCartLabel || "Add to cart";
        addBtn.className = "product-upsell-add-btn";
        addBtn.onclick = function () {
          addOfferToCart(offer, addBtn);
        };
        card.appendChild(addBtn);

        var viewBtn = document.createElement("button");
        viewBtn.type = "button";
        viewBtn.textContent = o.viewLabel || "View product";
        viewBtn.className = "product-upsell-view-btn";
        viewBtn.onclick = function () {
          if (!offer.productHandle) return;
          track(o.clickedUrl, offer).finally(function () {
            location.href =
              "/products/" +
              encodeURIComponent(offer.productHandle) +
              "?variant=" +
              numericId(offer.variantId);
          });
        };
        card.appendChild(viewBtn);
      } else {
        var badge = document.createElement("div");
        badge.className = "product-upsell-preview-badge";
        badge.textContent = o.previewBadgeLabel || "Preview";
        card.appendChild(badge);
      }

      return card;
    }

    function renderOffers(offers) {
      var root = document.getElementById("product-upsell-root");
      var items = document.getElementById("product-upsell-items");
      var notice = document.getElementById("product-upsell-editor-notice");
      if (!root || !items) return;

      items.innerHTML = "";
      if (notice) notice.style.display = "none";
      hideError();

      offers.forEach(function (offer) {
        items.appendChild(renderOfferCard(offer, { readOnly: false }));
      });

      root.style.display = offers.length ? "block" : "none";
    }

    function renderEditorEmptyState(reason) {
      var root = document.getElementById("product-upsell-root");
      var items = document.getElementById("product-upsell-items");
      var notice = document.getElementById("product-upsell-editor-notice");
      if (!root || !items) return;

      items.innerHTML = "";
      hideError();

      if (notice) {
        notice.textContent =
          o.editorPreviewMessage ||
          "Theme editor preview: no active Product Page offer matches this product. Upsells appear when the product is a trigger on an active offer with display location On Product Page.";
        if (reason) {
          notice.textContent += " (" + reason + ")";
        }
        notice.style.display = "block";
      }

      var previews = Array.isArray(o.previewProducts) ? o.previewProducts : [];
      if (previews.length === 0) {
        previews = [
          {
            productTitle: "Sample upsell product",
            variantTitle: "Example variant",
            price: "19.99",
            imageUrl: null,
          },
          {
            productTitle: "Another recommended item",
            variantTitle: null,
            price: "24.00",
            imageUrl: null,
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
              productHandle: p.handle || null,
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

      root.style.display = "block";
      root.setAttribute("data-upsell-preview", "theme-editor");
    }

    function addOfferToCart(offer, button) {
      var id = identity();
      var originalLabel = button.textContent;
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
              properties: {
                _upsell_offer_id: offer.offerId,
                _upsell_product_id: offer.productId,
                _upsell_variant_id: offer.variantId,
                _upsell_customer_id: id.customerId || "",
                _upsell_guest_key: id.guestKey || id.clientId || "",
              },
            },
          ],
        }),
      })
        .then(function (res) {
          if (!res.ok) throw new Error("add to cart failed");
          return res.json();
        })
        .then(function () {
          return track(o.clickedUrl, offer).then(function () {
            return track(o.addedToCartUrl, offer);
          });
        })
        .then(function () {
          return fetchCart()
            .catch(function () {
              return null;
            })
            .then(function (cart) {
              return refreshCartSections()
                .catch(function (err) {
                  console.error("Product upsell cart refresh error:", err);
                })
                .then(function () {
                  document.dispatchEvent(new CustomEvent("cart:refresh", { bubbles: true }));
                  document.dispatchEvent(
                    new CustomEvent("cart:updated", { bubbles: true, detail: { cart: cart } }),
                  );
                  openCartDrawer();
                  loadOffers();
                });
            });
        })
        .catch(function (err) {
          console.error("Product upsell add error:", err);
          showError("Could not add this product to your cart. Please try again.");
        })
        .then(function () {
          button.disabled = false;
          button.textContent = originalLabel;
        });
    }

    function loadOffers() {
      if (!o.eligibilityUrl || !o.shop || !o.productId) {
        if (isDesignMode() && showEditorPreviewEnabled()) {
          renderEditorEmptyState("missing product context");
        }
        return;
      }

      var variantId = selectedVariantId();
      if (!variantId) {
        if (isDesignMode() && showEditorPreviewEnabled()) {
          renderEditorEmptyState("no variant selected");
        }
        return;
      }

      lastVariantId = variantId;
      var generation = ++loadGeneration;

      fetchEligible(variantId, generation)
        .then(function (offers) {
          if (generation !== loadGeneration) return;

          if (offers.length > 0) {
            renderOffers(offers);
            offers.forEach(function (offer) {
              var key = offer.offerId + ":" + offer.variantId;
              if (viewedKeys[key]) return;
              viewedKeys[key] = true;
              if (!isDesignMode()) track(o.viewedUrl, offer);
            });
            return;
          }

          if (isDesignMode() && showEditorPreviewEnabled()) {
            renderEditorEmptyState("0 eligible offers");
            return;
          }

          var root = document.getElementById("product-upsell-root");
          if (root) root.style.display = "none";
        })
        .catch(function (err) {
          if (generation !== loadGeneration) return;
          console.error("Product upsell load error:", err);
          if (isDesignMode() && showEditorPreviewEnabled()) {
            renderEditorEmptyState("API error — check app proxy / offers");
            return;
          }
          var root = document.getElementById("product-upsell-root");
          if (root) root.style.display = "none";
        });
    }

    function onVariantMaybeChanged() {
      var variantId = selectedVariantId();
      if (variantId && variantId !== lastVariantId) loadOffers();
    }

    document.addEventListener("variant:change", onVariantMaybeChanged);
    document.addEventListener("change", function (evt) {
      if (evt.target && evt.target.name === "id") onVariantMaybeChanged();
    });
    window.addEventListener("popstate", onVariantMaybeChanged);

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", loadOffers);
    } else {
      loadOffers();
    }
  })();
})();
