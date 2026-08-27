# Storefront upsell live-store checklist

Use after `shopify app build` / deploy. These surfaces cannot be verified against a live shop from this environment.

Reinstall (or re-auth) after this release so `write_pixels` and `read_customer_events` scopes are granted. The app creates the Activity Pixel on auth.

## Browse activity tracking

Tracking failed in testing when the web pixel was never created (it only ran after re-auth) or when the pixel sandbox could not reach the app proxy. Fixes: opening the app admin creates/updates the pixel; the storefront also has a same-origin **Upsell activity** app embed.

1. Deploy this build, then open the app in Shopify admin (Dashboard) once.
2. Settings → Customer events → **Activity Pixel** should be Connected. If Disconnected, reinstall/re-auth so `write_pixels` and `read_customer_events` are granted.
3. Theme Editor → App embeds → enable **Upsell activity** and save.
4. On the live storefront (not Theme Editor preview), open a product page, a collection, submit a search, and add to cart. Allow analytics cookies if the store shows a banner.
5. Confirm `POST /apps/checkout-upsell/api/activity` returns `{ recorded: true }`.
6. With tracking declined, no new activity rows should be stored.

## Cart page (`cart-upsell` theme app block)

1. Theme Editor → cart template → add **Cart Upsell**.
2. Add a trigger product to the cart so the block can load eligible cross-sells (`placement=checkout`).
3. Confirm offers render (title, image, price, Add to cart).
4. Add an offer to cart and inspect `/cart.js` (or cart line properties) for `_upsell_offer_id`, `_upsell_product_id`, `_upsell_variant_id`, `_upsell_customer_id` or `_upsell_guest_key`.
5. Confirm viewed / clicked / added-to-cart events in app analytics.
6. Complete checkout and confirm `orders/paid` records a purchase for those line properties.

## Smart ranking

1. Create two eligible cross-sells for the same trigger product, with different upsell products.
2. As the same guest or customer, browse one of those upsell products on the storefront (pixel `product_viewed`).
3. Open the cart with the trigger product. Confirm the recently viewed upsell is ordered first among eligible offers.
4. In a private window with no browse activity, confirm offer order falls back to eligibility order (stable).

## Thank-you page (`thankyou-upsell` checkout UI extension)

1. Checkout Editor → Thank you page → add **Thank You Upsell**.
2. Place a test order whose products match a post-purchase offer.
3. Confirm the block appears and the CTA is **Add to cart / Checkout** (new checkout, not an order edit).
4. Accept an offer and confirm the cart-add permalink includes `_upsell_*` properties and `return_to=/checkout`.
5. Confirm clicked fires on press and added-to-cart only when the accept URL is valid.
6. Complete the follow-on checkout and confirm purchase attribution on the paid order.

## Funnel analytics

1. Open Analytics. Confirm rates for view→click, click→add to cart, add to cart→purchase, and view→purchase.
2. Confirm optional browse→offer is populated after pixel events and a later offer view for the same customer GID or guest/client id.
3. Open an offer detail page and confirm the same funnel plus browse→offer. There is no separate “AI conversion” event.
