(function () {
  function run() {
    var r = window.CheckoutUpsellRuntime;
    if (r && r.startDrawer) r.startDrawer();
    else setTimeout(run, 30);
  }
  run();
})();
