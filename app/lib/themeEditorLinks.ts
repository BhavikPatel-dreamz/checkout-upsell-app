export function storeHandleFromShop(shop: string): string {
  return shop.replace(/\.myshopify\.com$/i, "");
}

export function themeEditorLinks(shop: string, apiKey: string) {
  const store = storeHandleFromShop(shop);
  const admin = `https://admin.shopify.com/store/${store}`;
  const api = encodeURIComponent(apiKey);

  return {
    cartBlock: `${admin}/themes/current/editor?template=cart&addAppBlockId=${api}/cart-upsell/cart-upsell&target=newAppsSection`,
    productBlock: `${admin}/themes/current/editor?template=product&addAppBlockId=${api}/cart-upsell/product-upsell&target=newAppsSection`,
    appEmbeds: `${admin}/themes/current/editor?context=apps`,
    checkoutEditor: `${admin}/settings/checkout/editor`,
    thankYouEditor: `${admin}/settings/checkout/editor?page=thank-you`,
  };
}
