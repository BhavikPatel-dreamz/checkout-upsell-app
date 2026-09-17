(function () {
  function run() {
    var r = window.CheckoutUpsellRuntime;
    if (r && r.startCart) r.startCart();
    else setTimeout(run, 30);
  }
  run();
})();
