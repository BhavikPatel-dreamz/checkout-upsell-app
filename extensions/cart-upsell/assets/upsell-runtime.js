(function (window) {
  if (window.CheckoutUpsellRuntime) return;

  var GUEST = "checkout-upsell-guest-key";
  var spin = document.createElement("style");
  spin.textContent = "@keyframes cart-upsell-spin{to{transform:rotate(360deg)}}";
  (document.head || document.documentElement).appendChild(spin);

  function guestKey() {
    try {
      var s = sessionStorage.getItem(GUEST);
      if (s) return s;
      var n = "guest-" + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now());
      sessionStorage.setItem(GUEST, n);
      return n;
    } catch (_e) {
      return "guest-" + Date.now();
    }
  }

  function identity(cfg) {
    var raw = cfg.customerId;
    var customerId = raw
      ? String(raw).indexOf("gid://shopify/Customer/") === 0
        ? String(raw)
        : "gid://shopify/Customer/" + raw
      : null;
    var clientId = null;
    try {
      var m = document.cookie.match(/(?:^|; )_shopify_y=([^;]*)/);
      clientId = m ? decodeURIComponent(m[1]) : null;
    } catch (_e) {}
    return customerId
      ? { customerId: customerId, guestKey: null, clientId: clientId, isGuest: false }
      : { customerId: null, guestKey: guestKey(), clientId: clientId, isGuest: true };
  }

  function gid(type, value) {
    var raw = String(value || "");
    if (raw.indexOf("gid://") === 0) return raw;
    var m = raw.match(/(\d+)\s*$/);
    return m ? "gid://shopify/" + type + "/" + m[1] : raw;
  }

  function numericId(value) {
    var m = String(value || "").match(/(\d+)\s*$/);
    return m ? m[1] : String(value || "");
  }

  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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

  function cartJson() {
    return fetch("/cart.js", { credentials: "same-origin" }).then(function (res) {
      if (!res.ok) throw new Error("cart.js failed");
      return res.json();
    });
  }

  function track(cfg, url, offer, placement) {
    if (!url) return Promise.resolve();
    var who = identity(cfg);
    return fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shop: cfg.shop,
        offerId: offer.offerId,
        offerName: offer.offerName,
        productId: offer.productId,
        variantId: offer.variantId,
        placement: placement,
        customerId: who.customerId,
        guestKey: who.guestKey || who.clientId,
        isGuest: who.isGuest,
      }),
    }).catch(function () {});
  }

  function consented() {
    try {
      var p = window.Shopify && window.Shopify.customerPrivacy;
      if (!p || typeof p.analyticsProcessingAllowed !== "function") return true;
      return p.analyticsProcessingAllowed() !== false;
    } catch (_e) {
      return true;
    }
  }

  function merge(decision, eligible) {
    if (!decision || !decision.show) return [];
    var wanted = {};
    (decision.products || []).forEach(function (row) {
      if (row && row.productId) wanted[row.productId] = true;
    });
    var keys = Object.keys(wanted);
    if (!keys.length) return eligible || [];
    var matched = (eligible || []).filter(function (row) {
      return row && wanted[row.productId];
    });
    return matched.length ? matched : eligible || [];
  }

  function postDecide(cfg, payload) {
    if (!cfg.decideUrl) return Promise.resolve(null);
    return fetch(cfg.decideUrl, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        if (!res.ok) throw new Error("decide failed");
        return res.json();
      })
      .catch(function () {
        return null;
      });
  }

  function fetchEligible(cfg, productIds, variantIds, placement, extra) {
    var params = new URLSearchParams({
      shop: cfg.shop || "",
      placement: placement,
      productIds: productIds.join(","),
      variantIds: variantIds.join(","),
    });
    if (extra && extra.displayLocation) params.set("displayLocation", extra.displayLocation);
    if (extra && extra.excludeProductIds) params.set("excludeProductIds", extra.excludeProductIds);
    var who = identity(cfg);
    if (who.customerId) params.set("customerId", who.customerId);
    if (who.guestKey) params.set("guestKey", who.guestKey);
    if (who.clientId) params.set("clientId", who.clientId);
    return fetch(cfg.eligibilityUrl + "?" + params.toString(), { credentials: "same-origin" }).then(function (res) {
      if (!res.ok) throw new Error("eligible request failed");
      return res.json();
    });
  }

  function cartIds(cart) {
    var productIds = [];
    var variantIds = [];
    (cart.items || []).forEach(function (item) {
      if (item.product_id) productIds.push(gid("Product", item.product_id));
      if (item.variant_id) variantIds.push(gid("ProductVariant", item.variant_id));
    });
    return { productIds: productIds, variantIds: variantIds };
  }

  function cardHtml(offer) {
    return (
      (offer.imageUrl
        ? '<img src="' + esc(offer.imageUrl) + '" alt="' + esc(offer.productTitle) + '" style="width:100%;height:140px;object-fit:cover;border-radius:6px">'
        : "") +
      (offer.promotionalTitle
        ? '<div style="font-size:12px;color:#666;font-weight:600">' + esc(offer.promotionalTitle) + "</div>"
        : "") +
      '<div style="font-size:14px;font-weight:600">' +
      esc(offer.productTitle) +
      "</div>" +
      (offer.variantTitle ? '<div style="font-size:12px;color:#666">' + esc(offer.variantTitle) + "</div>" : "") +
      (offer.price ? '<div style="font-size:13px">$' + esc(offer.price) + "</div>" : "")
    );
  }

  function hide(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = "none";
  }

  function refreshSelectors(selectors) {
    var url = new URL(window.location.href);
    url.searchParams.set("_cart_refresh", Date.now());
    return fetch(url.toString(), {
      credentials: "same-origin",
      cache: "no-store",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    })
      .then(function (res) {
        if (!res.ok) throw new Error("refresh failed");
        return res.text();
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, "text/html");
        selectors.forEach(function (sel) {
          var cur = document.querySelector(sel);
          var next = doc.querySelector(sel);
          if (cur && next) cur.replaceWith(next);
        });
      });
  }

  function emitCart(cart) {
    document.dispatchEvent(new CustomEvent("cart:refresh", { bubbles: true }));
    document.dispatchEvent(new CustomEvent("cart:updated", { bubbles: true, detail: { cart: cart } }));
  }

  function addItem(cfg, offer, button, placement, after) {
    var who = identity(cfg);
    var label = button.textContent;
    button.disabled = true;
    button.innerHTML =
      '<span style="display:inline-block;width:12px;height:12px;margin-right:6px;border:2px solid rgba(255,255,255,.45);border-top-color:#fff;border-radius:50%;vertical-align:-2px;animation:cart-upsell-spin .7s linear infinite"></span>Adding...';
    return fetch("/cart/add.js", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: numericId(offer.variantId),
        quantity: 1,
        properties: lineProperties(offer, who),
      }),
    })
      .then(function (res) {
        if (!res.ok) throw new Error("add failed");
        return res.json();
      })
      .then(function () {
        return track(cfg, cfg.clickedUrl, offer, placement).then(function () {
          return track(cfg, cfg.addedToCartUrl, offer, placement);
        });
      })
      .then(function () {
        return after ? after() : null;
      })
      .catch(function (err) {
        console.error("Upsell add error:", err);
        throw err;
      })
      .then(
        function () {
          button.disabled = false;
          button.textContent = label;
        },
        function (err) {
          button.disabled = false;
          button.textContent = label;
          throw err;
        },
      );
  }

  function renderCarousel(rootId, itemsId, offers, headline, cfg, onAdd) {
    var root = document.getElementById(rootId);
    var items = document.getElementById(itemsId);
    var heading = root && root.querySelector("h3");
    if (!items || !root) return;
    if (headline && heading) heading.textContent = headline;
    items.innerHTML = "";
    var label = cfg.addToCartLabel || "Add to cart";
    offers.forEach(function (offer) {
      var card = document.createElement("div");
      card.style.cssText =
        "flex:0 0 180px;scroll-snap-align:start;border:1px solid #eee;border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px";
      card.innerHTML = cardHtml(offer);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.style.cssText =
        "margin-top:auto;padding:8px 12px;border:0;border-radius:6px;background:#111;color:#fff;cursor:pointer;font-size:13px";
      btn.onclick = function () {
        onAdd(offer, btn);
      };
      card.appendChild(btn);
      items.appendChild(card);
    });
    root.style.display = offers.length ? "block" : "none";
  }

  function wrapFetch(onCartMutate) {
    if (typeof window.fetch !== "function" || window.__CU_FETCH_WRAP__) return;
    window.__CU_FETCH_WRAP__ = true;
    var orig = window.fetch;
    window.fetch = function () {
      var input = arguments[0];
      var url = typeof input === "string" ? input : input && input.url;
      var pending = orig.apply(this, arguments);
      if (url && /\/cart\/(change|update|clear)(?:\.js)?(?:\?|$)/.test(String(url))) {
        pending.then(function (res) {
          if (res.ok) onCartMutate();
          return res;
        });
      }
      return pending;
    };
  }

  function startCartSurface(opts) {
    var cfgName = opts.cfgName;
    var rootId = opts.rootId;
    var itemsId = opts.itemsId;
    var errId = opts.errId;
    var viewed = {};
    function cfg() {
      return window[cfgName] || {};
    }
    function load() {
      var c = cfg();
      if (!c.eligibilityUrl || !c.shop) {
        hide(rootId);
        return Promise.resolve();
      }
      return cartJson()
        .then(function (cart) {
          if (!cart || !cart.items || !cart.items.length) {
            hide(rootId);
            return null;
          }
          var ids = cartIds(cart);
          var who = identity(c);
          return Promise.all([
            fetchEligible(c, ids.productIds, ids.variantIds, "checkout"),
            postDecide(c, {
              shop: c.shop,
              surface: "cart",
              productIds: ids.productIds,
              variantIds: ids.variantIds,
              cartProductIds: ids.productIds,
              customerId: who.customerId,
              anonId: who.clientId || who.guestKey,
              sessionId: who.guestKey,
              consented: consented(),
              cartValue: cart.total_price ? Number(cart.total_price) / 100 : 0,
            }),
          ]).then(function (pair) {
            var eligible = (pair[0] && pair[0].offers) || [];
            var decision = pair[1];
            var offers = decision ? merge(decision, eligible) : eligible;
            if (!offers.length) {
              hide(rootId);
              return;
            }
            renderCarousel(rootId, itemsId, offers, decision && decision.copy && decision.copy.headline, c, function (offer, btn) {
              var err = document.getElementById(errId);
              if (err) {
                err.textContent = "";
                err.style.display = "none";
              }
              addItem(c, offer, btn, "checkout", function () {
                return load().then(function () {
                  return cartJson().then(function (nextCart) {
                    var chain = opts.refreshPage
                      ? refreshSelectors([
                          "cart-items",
                          "#main-cart-items",
                          "#main-cart-footer",
                          "[data-cart-items]",
                          "[data-cart-form]",
                          ".cart__items",
                          ".cart__footer",
                          'form[action="/cart"]',
                        ]).catch(function () {})
                      : Promise.resolve();
                    return chain.then(function () {
                      emitCart(nextCart);
                    });
                  });
                });
              }).catch(function () {
                if (err) {
                  err.textContent = "Could not add this product to your cart. Please try again.";
                  err.style.display = "block";
                }
              });
            });
            var err = document.getElementById(errId);
            if (err) {
              err.textContent = "";
              err.style.display = "none";
            }
            offers.forEach(function (offer) {
              if (viewed[offer.offerId]) return;
              viewed[offer.offerId] = true;
              track(c, c.viewedUrl, offer, "checkout");
            });
          });
        })
        .catch(function (err) {
          console.error(opts.log, err);
          hide(rootId);
        });
    }
    ["cart:updated", "cart:refresh", "cart:change"].forEach(function (name) {
      document.addEventListener(name, load);
    });
    wrapFetch(load);
    if (opts.removeClick) {
      document.addEventListener("click", function (event) {
        var t = event.target && event.target.closest
          ? event.target.closest('[data-cart-remove], a[href*="/cart/change"], button[name="remove"]')
          : null;
        if (t) setTimeout(load, 500);
      });
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load);
    else load();
  }

  function startProduct() {
    var config = window.PRODUCT_UPSELL_CONFIG || {};
    if (!config.shop || !config.productId) return;
    var viewed = {};
    var seq = 0;
    var lastVariant = null;
    var pageStarted = Date.now();
    var deepestScroll = 0;
    var exitIntent = false;
    var retryTimer = null;

    function selectedVariant() {
      var input = document.querySelector('form[action*="/cart/add"] [name="id"]');
      try {
        var q = new URLSearchParams(location.search).get("variant");
        if (q) return gid("ProductVariant", q);
      } catch (_e) {}
      return input && input.value ? gid("ProductVariant", input.value) : config.variantId;
    }

    function fetchOffers(placement, variantId, requestSeq) {
      return cartJson()
        .catch(function () {
          return {};
        })
        .then(function () {
          return fetchEligible(config, [config.productId], variantId ? [variantId] : [], placement, {
            displayLocation: placement,
            excludeProductIds: config.productId,
          });
        })
        .then(function (body) {
          return requestSeq === seq ? (body && body.offers) || [] : [];
        });
    }

    function identityKey() {
      var who = identity(config);
      return who.customerId || who.guestKey || who.clientId || "anon";
    }

    function capHoursFor(channel) {
      if (channel === "popup") return Number(config.popupFrequencyHours || 24);
      if (channel === "sidebar" || channel === "sticky") return Number(config.railFrequencyHours || 12);
      return 0;
    }

    function canShowChannel(channel) {
      if (config.enabledChannels && config.enabledChannels.indexOf(channel) === -1) return false;
      var key = "cu_freq:" + (config.shop || "") + ":" + identityKey() + ":" + channel;
      try {
        if (sessionStorage.getItem(key + ":session") === "1") return false;
      } catch (_e) {}
      var hours = capHoursFor(channel);
      if (hours <= 0) return true;
      try {
        var last = Number(localStorage.getItem(key) || "");
        if (!last) return true;
        return Date.now() - last >= hours * 3600000;
      } catch (_e2) {
        return true;
      }
    }

    function markChannelShown(channel) {
      var key = "cu_freq:" + (config.shop || "") + ":" + identityKey() + ":" + channel;
      try {
        sessionStorage.setItem(key + ":session", "1");
        localStorage.setItem(key, String(Date.now()));
      } catch (_e) {}
    }

    function scrollDepth() {
      var doc = document.documentElement;
      var max = Math.max(doc.scrollHeight - window.innerHeight, 1);
      return Math.min(1, Math.max(deepestScroll, window.scrollY / max));
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
        addProduct(offer, add, placement);
      };
      var view = document.createElement("button");
      view.type = "button";
      view.textContent = config.viewLabel || "View product";
      view.style.cssText =
        "padding:8px 12px;border:1px solid #111;border-radius:6px;background:#fff;color:#111;cursor:pointer;font-size:13px";
      view.onclick = function () {
        if (!offer.productHandle) return;
        track(config, config.clickedUrl, offer, placement).finally(function () {
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
        track(config, config.viewedUrl, offer, placement);
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
        '<h3 style="margin:0 0 12px 0;font-size:16px">You might also like</h3>' +
        '<div id="product-upsell-popup-items"></div></div>';
      document.body.appendChild(overlay);
      overlay.onclick = function (event) {
        if (event.target === overlay) overlay.style.display = "none";
      };
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
      aside.innerHTML =
        '<h3 style="margin:0 0 12px 0;font-size:16px">Recommended</h3><div id="product-upsell-sidebar-items"></div>';
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

    function openCartDrawer() {
      var drawer = document.querySelector("cart-drawer, [data-cart-drawer], #CartDrawer, .cart-drawer");
      if (drawer && typeof drawer.open === "function") drawer.open();
      else if (drawer && typeof drawer.show === "function") drawer.show();
      document.dispatchEvent(new CustomEvent("cart-drawer:open", { bubbles: true }));
      document.dispatchEvent(new CustomEvent("drawer:open", { bubbles: true, detail: { drawer: "cart" } }));
    }

    function addProduct(offer, button, placement) {
      addItem(config, offer, button, placement, function () {
        return cartJson()
          .catch(function () {
            return null;
          })
          .then(function (cart) {
            return refreshSelectors([
              "cart-drawer",
              "cart-items",
              "#main-cart-items",
              "#main-cart-footer",
              "[data-cart-items]",
              "[data-cart-form]",
              ".cart__items",
              ".cart__footer",
              'form[action="/cart"]',
            ])
              .catch(function () {})
              .then(function () {
                emitCart(cart);
                openCartDrawer();
                load();
              });
          });
      }).catch(function () {
        var el = document.getElementById("product-upsell-error");
        if (el) {
          el.textContent = "Could not add this product to your cart. Please try again.";
          el.style.display = "block";
        }
      });
    }

    function decideProducts(decision) {
      return (decision.products || [])
        .map(function (row) {
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
        })
        .filter(function (row) {
          return row.variantId;
        });
    }

    function applyDecision(decision, fallbackOffers) {
      if (!decision || !decision.show) {
        if (fallbackOffers && fallbackOffers.inline && fallbackOffers.inline.length) renderInline(fallbackOffers.inline);
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
      if (channel === "popup") renderPopup(products.length ? products : fallbackOffers.popup || []);
      else if (channel === "sidebar") renderSidebar(products.length ? products : fallbackOffers.sidebar || []);
      else if (channel === "sticky") renderSticky(products.length ? products : fallbackOffers.inline || [], copy);
      else renderInline(products.length ? products : fallbackOffers.inline || []);
      markChannelShown(channel);
    }

    function load() {
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
          var who = identity(config);
          var eligible = config.eligibilityUrl
            ? Promise.all([
                fetchOffers("product_page", variantId, requestSeq),
                fetchOffers("popup", variantId, requestSeq),
                fetchOffers("sidebar", variantId, requestSeq),
              ])
            : Promise.resolve([[], [], []]);
          return Promise.all([
            postDecide(config, {
              shop: config.shop,
              surface: "product_page",
              productIds: config.productId ? [config.productId] : [],
              variantIds: variantId ? [variantId] : [],
              cartProductIds: config.productId ? [config.productId] : [],
              customerId: who.customerId,
              anonId: who.clientId || who.guestKey,
              sessionId: who.guestKey,
              consented: consented(),
              dwellMs: Date.now() - pageStarted,
              scrollDepth: scrollDepth(),
              exitIntent: exitIntent,
              cartValue: cartValue || 0,
            }),
            eligible,
          ]);
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
          hide("product-upsell-root");
        });
    }

    function onVariantChange() {
      var variantId = selectedVariant();
      if (variantId && variantId !== lastVariant) load();
    }

    window.addEventListener(
      "scroll",
      function () {
        deepestScroll = Math.max(deepestScroll, scrollDepth());
      },
      { passive: true },
    );
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
  }

  window.CheckoutUpsellDecide = {
    merge: merge,
    post: function (url, payload) {
      return postDecide({ decideUrl: url }, payload);
    },
    consented: consented,
  };

  window.CheckoutUpsellRuntime = {
    startCart: function () {
      startCartSurface({
        cfgName: "CART_UPSELL_CONFIG",
        rootId: "cart-upsell-root",
        itemsId: "cart-upsell-items",
        errId: "cart-upsell-error",
        log: "Cart upsell load error:",
        refreshPage: true,
        removeClick: true,
      });
    },
    startDrawer: function () {
      startCartSurface({
        cfgName: "CART_DRAWER_UPSELL_CONFIG",
        rootId: "cart-drawer-upsell-root",
        itemsId: "cart-drawer-upsell-items",
        errId: "cart-drawer-upsell-error",
        log: "Cart drawer upsell load error:",
        refreshPage: false,
        removeClick: false,
      });
    },
    startProduct: startProduct,
  };
})(window);
