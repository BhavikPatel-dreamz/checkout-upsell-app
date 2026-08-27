# Storefront upsell live-store checklist

Use after `shopify app build` / deploy. These surfaces cannot be verified against a live shop from this environment.

## Cart page (`cart-upsell` theme app block)

1. Theme Editor → cart template → add **Cart Upsell**.
2. Add a trigger product to the cart so the block can load eligible cross-sells (`placement=checkout`).
3. Confirm offers render (title, image, price, Add to cart).
4. Add an offer to cart and inspect `/cart.js` (or cart line properties) for `_upsell_offer_id`, `_upsell_product_id`, `_upsell_variant_id`, `_upsell_customer_id` or `_upsell_guest_key`.
5. Confirm viewed / clicked / added-to-cart events in app analytics.
6. Complete checkout and confirm `orders/paid` records a purchase for those line properties.

## Thank-you page (`thankyou-upsell` checkout UI extension)

1. Checkout Editor → Thank you page → add **Thank You Upsell**.
2. Place a test order whose products match a post-purchase offer.
3. Confirm the block appears and the CTA is **Add to cart / Checkout** (new checkout, not an order edit).
4. Accept an offer and confirm the cart-add permalink includes `_upsell_*` properties and `return_to=/checkout`.
5. Confirm clicked fires on press and added-to-cart only when the accept URL is valid.
6. Complete the follow-on checkout and confirm purchase attribution on the paid order.
