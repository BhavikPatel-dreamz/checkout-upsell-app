(function (window) {
  if (window.CheckoutUpsellDecide) return;
  window.CheckoutUpsellDecide = {
    merge: function (d, e) {
      return window.CheckoutUpsellRuntime ? window.CheckoutUpsellRuntime : { merge: function () { return e || []; } };
    },
  };
})(window);
