(function () {
  function run() {
    var r = window.CheckoutUpsellRuntime;
    if (r && r.startProduct) r.startProduct();
    else setTimeout(run, 30);
  }
  run();
})();
