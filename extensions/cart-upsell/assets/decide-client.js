(function (window) {
  window.CheckoutUpsellDecide = {
    merge: function (decision, eligible) {
      if (!decision || !decision.show) return [];
      var products = decision.products || [];
      var wanted = {};
      for (var i = 0; i < products.length; i++) {
        if (products[i] && products[i].productId) wanted[products[i].productId] = true;
      }
      var keys = Object.keys(wanted);
      if (!keys.length) return eligible || [];
      var matched = (eligible || []).filter(function (row) {
        return row && wanted[row.productId];
      });
      return matched.length ? matched : eligible || [];
    },
    post: function (url, payload) {
      if (!url) return Promise.resolve(null);
      return fetch(url, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then(function (res) {
        if (!res.ok) throw new Error("decide failed");
        return res.json();
      });
    },
    consented: function () {
      try {
        var privacy = window.Shopify && window.Shopify.customerPrivacy;
        if (!privacy || typeof privacy.analyticsProcessingAllowed !== "function") return true;
        return privacy.analyticsProcessingAllowed() !== false;
      } catch (_err) {
        return true;
      }
    },
  };
})(window);
