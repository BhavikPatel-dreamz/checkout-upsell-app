/**
 * Cart Upsell JavaScript
 * Fetches cart data, calls the eligibility API, and renders multiple upsell offers.
 */

(function () {
  var root = document.getElementById("cart-upsell-root");
  var container = document.getElementById("cart-upsell-items");
  var errorDiv = document.getElementById("cart-upsell-error");
  if (!root || !container) return;

  var cfg = window.CART_UPSELL_CONFIG;
  if (!cfg || !cfg.eligibilityUrl) return;

  function showError(message) {
    if (errorDiv) {
      errorDiv.textContent = message;
      errorDiv.style.display = "block";
    }
  }

  function hideError() {
    if (errorDiv) errorDiv.style.display = "none";
  }

  function renderProductCard(offer) {
    var card = document.createElement("div");
    card.className = "cart-upsell-card";
    card.setAttribute("data-variant-id", offer.variantId);
    card.style.cssText = "display: flex; flex-direction: column; gap: 10px; width: min(220px, 75vw); min-width: 200px; flex: 0 0 220px; padding: 12px; background: #fff; border-radius: 8px; border: 1px solid #e5e5e5; box-sizing: border-box; box-shadow: 0 1px 2px rgba(0,0,0,0.04); scroll-snap-align: start;";

    var img = document.createElement("img");
    img.src = offer.imageUrl || "";
    img.alt = offer.productTitle || "";
    img.style.cssText = "width: 100%; height: 150px; object-fit: cover; border-radius: 6px; background: #f3f3f3; display: block;";
    if (!offer.imageUrl) img.style.display = "none";
    card.appendChild(img);

    var details = document.createElement("div");
    details.style.cssText = "display: flex; flex-direction: column; gap: 6px; flex: 1;";

    if (offer.promotionalTitle) {
      var promo = document.createElement("p");
      promo.textContent = offer.promotionalTitle;
      promo.style.cssText = "margin: 0; font-size: 11px; line-height: 1.3; color: #0066cc; font-weight: 600;";
      details.appendChild(promo);
    }

    var title = document.createElement("h4");
    title.textContent = offer.productTitle || "";
    title.style.cssText = "margin: 0; font-size: 14px; font-weight: 600; line-height: 1.4; color: #1a1a1a;";
    details.appendChild(title);

    if (offer.variantTitle) {
      var variant = document.createElement("p");
      variant.textContent = offer.variantTitle;
      variant.style.cssText = "margin: 0; font-size: 12px; color: #666; line-height: 1.4;";
      details.appendChild(variant);
    }

    var price = document.createElement("p");
    price.textContent = "$" + (offer.price || "0.00");
    price.style.cssText = "margin: 0; font-size: 14px; color: #1a1a1a; font-weight: 500;";
    details.appendChild(price);

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cart-upsell-btn";
    btn.setAttribute("data-variant-id", offer.variantId);
    btn.textContent = "Add to cart";
    btn.style.cssText = "margin-top: auto; background: #000; color: #fff; border: none; padding: 10px 14px; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 600; width: 100%;";
    details.appendChild(btn);

    card.appendChild(details);

    return card;
  }

  async function addToCart(variantId, button) {
    var originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Adding...";
    hideError();

    // Extract numeric variant ID from GID
    var numericId = variantId.split("/").pop();

    try {
      var res = await fetch("/cart/add.js", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ id: parseInt(numericId, 10), quantity: 1 }] }),
      });

      if (!res.ok) throw new Error("Add to cart failed");

      // Remove the card from the list
      var card = button.closest(".cart-upsell-card");
      if (card) {
        card.style.transition = "opacity 0.2s, transform 0.2s";
        card.style.opacity = "0";
        card.style.transform = "translateX(20px)";
        setTimeout(function () {
          card.remove();
          // If no more products, hide the entire block
          if (container.children.length === 0) {
            root.style.display = "none";
          }
        }, 200);
      }

      // Reload page to update cart count
      setTimeout(function () {
        window.location.reload();
      }, 300);
    } catch (err) {
      button.disabled = false;
      button.textContent = originalText;
      showError("Failed to add item to cart. Please try again.");
      console.error("Cart upsell add to cart error:", err);
    }
  }

  async function init() {
    try {
      // 1. Read current Shopify cart
      var cartRes = await fetch("/cart.json");
      if (!cartRes.ok) {
        root.style.display = "none";
        return;
      }
      var cart = await cartRes.json();
      if (!cart || !cart.items || cart.items.length === 0) {
        root.style.display = "none";
        return;
      }

      // 2. Extract product IDs and variant IDs from cart
      var productIds = cart.items.map(function (item) {
        return "gid://shopify/Product/" + item.product_id;
      });
      var variantIds = cart.items.map(function (item) {
        return "gid://shopify/ProductVariant/" + item.variant_id;
      });

      // 3. Call the eligibility API
      var params = new URLSearchParams({
        shop: window.Shopify?.shop || "",
        placement: "checkout",
        productIds: productIds.join(","),
        variantIds: variantIds.join(","),
      });

      var eligRes = await fetch(cfg.eligibilityUrl + "?" + params.toString());
      if (!eligRes.ok) return;
      var data = await eligRes.json();
      if (!data || !data.offers || data.offers.length === 0) {
        container.innerHTML = "";
        root.style.display = "none";
        return;
      }

      // 4. Render up to 5 eligible products in a horizontal row
      container.innerHTML = "";
      var visibleOffers = data.offers.slice(0, 5);
      visibleOffers.forEach(function (offer) {
        var card = renderProductCard(offer);
        container.appendChild(card);
      });

      // 5. Wire up all Add to cart buttons
      container.addEventListener("click", function (e) {
        var btn = e.target.closest(".cart-upsell-btn");
        if (!btn) return;
        var variantId = btn.getAttribute("data-variant-id");
        if (variantId) addToCart(variantId, btn);
      });

      // 6. Show the block
      root.style.display = "block";

    } catch (err) {
      console.error("Cart upsell error:", err);
      // Silently fail — the block stays hidden
    }
  }

  init();

  // Re-check the cart when cart contents change without requiring a full page refresh.
  var cartRefreshTimer = null;
  function scheduleCartRefresh() {
    if (cartRefreshTimer) clearTimeout(cartRefreshTimer);
    cartRefreshTimer = setTimeout(function () {
      init();
    }, 500);
  }

  window.addEventListener("cart:updated", scheduleCartRefresh);
  window.addEventListener("focus", scheduleCartRefresh);
})();
