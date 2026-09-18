"use strict";
(() => {
  (() => {
    (function() {
      var o = window.PRODUCT_UPSELL_CONFIG || {}, f = "checkout-upsell-guest-key", h = {}, u = 0, v = null;
      function x() {
        try {
          var t = sessionStorage.getItem(f);
          return t || (t = "guest-" + (crypto.randomUUID ? crypto.randomUUID() : Date.now()), sessionStorage.setItem(f, t)), t;
        } catch {
          return "guest-" + Date.now();
        }
      }
      function g(t, e) {
        var n = String(e || "");
        if (n.indexOf("gid://") === 0) return n;
        var r = n.match(/(\d+)\s*$/);
        return r ? "gid://shopify/" + t + "/" + r[1] : n;
      }
      function y(t) {
        var e = String(t || "").match(/(\d+)\s*$/);
        return e ? e[1] : String(t || "");
      }
      function p() {
        var t = o.customerId || null, e = (document.cookie.match(/(?:^|; )_shopify_y=([^;]*)/) || [])[1] || null;
        return t ? { customerId: t, guestKey: null, clientId: e, isGuest: false } : { customerId: null, guestKey: x(), clientId: e, isGuest: true };
      }
      function I() {
        return fetch("/cart.js", { credentials: "same-origin" }).then(function(t) {
          if (!t.ok) throw Error("cart.js failed");
          return t.json();
        });
      }
      function s(t, e) {
        if (!t) return Promise.resolve();
        var n = p();
        return fetch(t, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shop: o.shop, offerId: e.offerId, offerName: e.offerName, productId: e.productId, variantId: e.variantId, placement: "product_page", customerId: n.customerId, guestKey: n.guestKey || n.clientId, isGuest: n.isGuest }) }).catch(function(r) {
          console.error("Product upsell tracking error:", r);
        });
      }
      function w() {
        var t = document.querySelector('form[action*="/cart/add"] [name="id"]');
        try {
          var e = new URLSearchParams(location.search).get("variant");
          if (e) return g("ProductVariant", e);
        } catch {
        }
        return t && t.value ? g("ProductVariant", t.value) : o.variantId;
      }
      function b(t, e) {
        var n = p(), r = new URLSearchParams({ shop: o.shop || "", placement: "product_page", productIds: o.productId || "", variantIds: t || "" });
        return n.customerId && r.set("customerId", n.customerId), n.guestKey && r.set("guestKey", n.guestKey), n.clientId && r.set("clientId", n.clientId), I().then(function() {
          var a = [o.productId];
          return r.set("excludeProductIds", a.join(",")), fetch(o.eligibilityUrl + "?" + r.toString(), { credentials: "same-origin" });
        }).then(function(a) {
          if (!a.ok) throw Error("eligible request failed");
          return a.json();
        }).then(function(a) {
          return e === u ? a.offers || [] : [];
        });
      }
      function d(t) {
        return String(t || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      }
      function _(t) {
        var e = document.getElementById("product-upsell-error");
        e && (e.textContent = t, e.style.display = "block");
      }
      function E() {
        var t = document.querySelector("cart-drawer, [data-cart-drawer], #CartDrawer, .cart-drawer");
        if (t && typeof t.open == "function") {
          t.open();
          return;
        }
        if (t && typeof t.show == "function") {
          t.show();
          return;
        }
        document.dispatchEvent(new CustomEvent("cart-drawer:open", { bubbles: true })), document.dispatchEvent(new CustomEvent("drawer:open", { bubbles: true, detail: { drawer: "cart" } }));
      }
      function C() {
        var t = ["cart-drawer", "cart-items", "#main-cart-items", "#main-cart-footer", "[data-cart-items]", "[data-cart-form]", ".cart__items", ".cart__footer", 'form[action="/cart"]'], e = new URL(window.location.href);
        return e.searchParams.set("_cart_refresh", Date.now()), fetch(e.toString(), { credentials: "same-origin", cache: "no-store", headers: { "X-Requested-With": "XMLHttpRequest" } }).then(function(n) {
          if (!n.ok) throw Error("cart refresh failed");
          return n.text();
        }).then(function(n) {
          var r = new DOMParser().parseFromString(n, "text/html");
          t.forEach(function(a) {
            var i = document.querySelector(a), c = r.querySelector(a);
            i && c && i.replaceWith(c);
          });
        });
      }
      function S(t) {
        var e = document.getElementById("product-upsell-root"), n = document.getElementById("product-upsell-items");
        !e || !n || (n.innerHTML = "", t.forEach(function(r) {
          var a = document.createElement("div");
          a.className = "product-upsell-card", a.innerHTML = (r.imageUrl ? '<img src="' + d(r.imageUrl) + '" alt="' + d(r.productTitle) + '">' : "") + (r.promotionalTitle ? '<div class="product-upsell-promo">' + d(r.promotionalTitle) + "</div>" : "") + '<div class="product-upsell-product-title">' + d(r.productTitle) + "</div>" + (r.variantTitle ? '<div class="product-upsell-variant">' + d(r.variantTitle) + "</div>" : "") + (r.price ? '<div class="product-upsell-price">$' + d(r.price) + "</div>" : "");
          var i = document.createElement("button");
          i.type = "button", i.textContent = o.addToCartLabel || "Add to cart", i.className = "product-upsell-add-btn", i.onclick = function() {
            T(r, i);
          }, a.appendChild(i);
          var c = document.createElement("button");
          c.type = "button", c.textContent = o.viewLabel || "View product", c.className = "product-upsell-view-btn", c.onclick = function() {
            r.productHandle && s(o.clickedUrl, r).finally(function() {
              location.href = "/products/" + encodeURIComponent(r.productHandle) + "?variant=" + y(r.variantId);
            });
          }, a.appendChild(c), n.appendChild(a);
        }), e.style.display = t.length ? "block" : "none");
      }
      function T(t, e) {
        var n = p(), r = e.textContent;
        e.disabled = true, e.textContent = "Adding...", fetch("/cart/add.js", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: [{ id: y(t.variantId), quantity: 1, properties: { _upsell_offer_id: t.offerId, _upsell_product_id: t.productId, _upsell_variant_id: t.variantId, _upsell_customer_id: n.customerId || "", _upsell_guest_key: n.guestKey || n.clientId || "" } }] }) }).then(function(a) {
          if (!a.ok) throw Error("add to cart failed");
          return a.json();
        }).then(function() {
          return s(o.clickedUrl, t).then(function() {
            return s(o.addedToCartUrl, t);
          });
        }).then(function() {
          return I().catch(function() {
            return null;
          }).then(function(a) {
            return C().catch(function(i) {
              console.error("Product upsell cart refresh error:", i);
            }).then(function() {
              document.dispatchEvent(new CustomEvent("cart:refresh", { bubbles: true })), document.dispatchEvent(new CustomEvent("cart:updated", { bubbles: true, detail: { cart: a } })), E(), l();
            });
          });
        }).catch(function(a) {
          console.error("Product upsell add error:", a), _("Could not add this product to your cart. Please try again.");
        }).then(function() {
          e.disabled = false, e.textContent = r;
        });
      }
      function l() {
        if (!(!o.eligibilityUrl || !o.shop || !o.productId)) {
          var t = w();
          if (t) {
            v = t;
            var e = ++u;
            b(t, e).then(function(n) {
              e === u && (S(n), n.forEach(function(r) {
                var a = r.offerId + ":" + r.variantId;
                h[a] || (h[a] = true, s(o.viewedUrl, r));
              }));
            }).catch(function(n) {
              if (e === u) {
                console.error("Product upsell load error:", n);
                var r = document.getElementById("product-upsell-root");
                r && (r.style.display = "none");
              }
            });
          }
        }
      }
      function m() {
        var t = w();
        t && t !== v && l();
      }
      document.addEventListener("variant:change", m), document.addEventListener("change", function(t) {
        t.target && t.target.name === "id" && m();
      }), window.addEventListener("popstate", m), document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", l) : l();
    })();
  })();
})();
