(function () {
  var GUEST_STORAGE_KEY = "checkout-upsell-guest-key";
  var viewedOfferIds = {};

  function getConfig() {
    return window.CART_UPSELL_CONFIG || {};
  }

  function getGuestKey() {
    try {
      var stored = sessionStorage.getItem(GUEST_STORAGE_KEY);
      if (stored) return stored;
      var next =
        "guest-" +
        (window.crypto && crypto.randomUUID
          ? crypto.randomUUID()
          : Date.now() + "-" + Math.random().toString(16).slice(2));
      sessionStorage.setItem(GUEST_STORAGE_KEY, next);
      return next;
    } catch (_err) {
      return "guest-" + Date.now() + "-" + Math.random().toString(16).slice(2);
    }
  }

  function customerGid(customerId) {
    if (customerId == null || customerId === "") return null;
    var value = String(customerId);
    if (value.indexOf("gid://shopify/Customer/") === 0) return value;
    return "gid://shopify/Customer/" + value;
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
    var customerId = customerGid(getConfig().customerId);
    var clientId = getClientId();
    if (customerId) return { customerId: customerId, guestKey: null, clientId: clientId, isGuest: false };
    return { customerId: null, guestKey: getGuestKey(), clientId: clientId, isGuest: true };
  }

  function productGid(id) {
    var value = String(id);
    if (value.indexOf("gid://") === 0) return value;
    return "gid://shopify/Product/" + value;
  }

  function variantGid(id) {
    var value = String(id);
    if (value.indexOf("gid://") === 0) return value;
    return "gid://shopify/ProductVariant/" + value;
  }

  function numericVariantId(variantId) {
    var match = String(variantId).match(/(\d+)\s*$/);
    return match ? match[1] : String(variantId);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showError(message) {
    var el = document.getElementById("cart-upsell-error");
    if (!el) return;
    el.textContent = message;
    el.style.display = "block";
  }

  function hideError() {
    var el = document.getElementById("cart-upsell-error");
    if (!el) return;
    el.textContent = "";
    el.style.display = "none";
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
    var shop = getConfig().shop;
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

  function refreshStorefrontCart() {
    return fetchCart().then(function (cart) {
      var detail = { cart: cart, source: "cart-upsell" };

      document.dispatchEvent(new CustomEvent("cart:refresh", { detail: detail }));
      document.dispatchEvent(new CustomEvent("cart:updated", { detail: detail }));
      document.dispatchEvent(new CustomEvent("cart:change", { detail: detail }));

      var root = document.getElementById("cart-upsell-root");
      var currentSection = root && root.closest(".shopify-section");
      var sectionIds = [];
      var sectionElements = document.querySelectorAll("[data-section-id]");
      for (var i = 0; i < sectionElements.length; i++) {
        var sectionId = sectionElements[i].getAttribute("data-section-id");
        if (
          sectionId &&
          sectionIds.indexOf(sectionId) === -1 &&
          (!currentSection || !currentSection.contains(sectionElements[i]))
        ) {
          sectionIds.push(sectionId);
        }
      }

      if (sectionIds.length === 0) return cart;

      var sectionsUrl = new URL(window.location.href);
      sectionsUrl.search = "sections=" + encodeURIComponent(sectionIds.join(","));
      return fetch(sectionsUrl.toString(), { credentials: "same-origin" })
        .then(function (res) {
          if (!res.ok) throw new Error("cart sections failed");
          return res.json();
        })
        .then(function (sections) {
          sectionIds.forEach(function (sectionId) {
            var section = document.getElementById("shopify-section-" + sectionId);
            if (section && sections[sectionId]) section.outerHTML = sections[sectionId];
          });
          return cart;
        })
        .catch(function (err) {
          console.error("Cart section refresh error:", err);
          return cart;
        });
    });
  }

  function fetchEligible(cart) {
    var config = getConfig();
    var items = cart.items || [];
    var productIds = [];
    var variantIds = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].product_id) productIds.push(productGid(items[i].product_id));
      if (items[i].variant_id) variantIds.push(variantGid(items[i].variant_id));
    }

    var params = new URLSearchParams({
      shop: config.shop || "",
      placement: "checkout",
      productIds: productIds.join(","),
      variantIds: variantIds.join(","),
    });
    var id = identity();
    if (id.customerId) params.set("customerId", id.customerId);
    if (id.guestKey) params.set("guestKey", id.guestKey);
    if (id.clientId) params.set("clientId", id.clientId);

    return fetch(config.eligibilityUrl + "?" + params.toString(), {
      credentials: "same-origin",
    }).then(function (res) {
      if (!res.ok) throw new Error("eligible request failed");
      return res.json();
    });
  }

  function renderOffers(offers) {
    var container = document.getElementById("cart-upsell-items");
    if (!container) return;
    container.innerHTML = "";
    var label = getConfig().addToCartLabel || "Add to cart";

    offers.forEach(function (offer) {
      var card = document.createElement("div");
      card.style.cssText =
        "flex: 0 0 180px; scroll-snap-align: start; border: 1px solid #eee; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px;";

      var imgHtml = offer.imageUrl
        ? '<img src="' +
          escapeHtml(offer.imageUrl) +
          '" alt="' +
          escapeHtml(offer.productTitle) +
          '" style="width:100%;height:140px;object-fit:cover;border-radius:6px;" />'
        : "";

      var promo = offer.promotionalTitle
        ? '<div style="font-size:12px;color:#666;font-weight:600;">' +
          escapeHtml(offer.promotionalTitle) +
          "</div>"
        : "";

      var variant = offer.variantTitle
        ? '<div style="font-size:12px;color:#666;">' + escapeHtml(offer.variantTitle) + "</div>"
        : "";

      var price = offer.price
        ? '<div style="font-size:13px;">$' + escapeHtml(offer.price) + "</div>"
        : "";

      card.innerHTML =
        imgHtml +
        promo +
        '<div style="font-size:14px;font-weight:600;">' +
        escapeHtml(offer.productTitle) +
        "</div>" +
        variant +
        price;

      var button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.style.cssText =
        "margin-top:auto;padding:8px 12px;border:0;border-radius:6px;background:#111;color:#fff;cursor:pointer;font-size:13px;";
      button.addEventListener("click", function () {
        addOfferToCart(offer, button);
      });
      card.appendChild(button);
      container.appendChild(card);
    });
  }

  function addOfferToCart(offer, button) {
    hideError();
    if (button) button.disabled = true;
    var id = identity();
    var body = {
      id: numericVariantId(offer.variantId),
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
      body: JSON.stringify(body),
    })
      .then(function (res) {
        if (!res.ok) throw new Error("add to cart failed");
        return res.json();
      })
      .then(function () {
        var config = getConfig();
        return track(config.clickedUrl, offer, "checkout").then(function () {
          return track(config.addedToCartUrl, offer, "checkout");
        });
      })
      .then(function () {
        return refreshStorefrontCart().then(function () {
          return load();
        });
      })
      .catch(function (err) {
        console.error("Cart upsell add error:", err);
        showError("Could not add this product to your cart. Please try again.");
      })
      .then(function () {
        if (button) button.disabled = false;
      });
  }

  function load() {
    var config = getConfig();
    if (!config.eligibilityUrl || !config.shop) {
      hideRoot();
      return;
    }

    fetchCart()
      .then(function (cart) {
        if (!cart || !cart.items || cart.items.length === 0) {
          hideRoot();
          return null;
        }
        return fetchEligible(cart);
      })
      .then(function (data) {
        if (!data) return;
        var offers = data.offers || [];
        if (offers.length === 0) {
          hideRoot();
          return;
        }
        renderOffers(offers);
        showRoot();
        hideError();
        var config = getConfig();
        offers.forEach(function (offer) {
          if (viewedOfferIds[offer.offerId]) return;
          viewedOfferIds[offer.offerId] = true;
          track(config.viewedUrl, offer, "checkout");
        });
      })
      .catch(function (err) {
        console.error("Cart upsell load error:", err);
        hideRoot();
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load);
  } else {
    load();
  }
})();
