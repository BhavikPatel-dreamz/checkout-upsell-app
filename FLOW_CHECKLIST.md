# Flow Verification Checklist

Use this checklist after every task. Do not mark a flow complete based only on compilation; verify the actual behavior in a Shopify development store when the flow touches Shopify.

## Required Local Checks

Run the scripts that exist in `package.json`:

```bash
npm run lint
npm run typecheck
npm test --if-present
npm run build
```

Record each result in the task handoff. The current baseline has known lint failures in legacy extension code; do not claim a green lint result until those errors are removed.

## Installation and Security

| Check | Pass condition |
| --- | --- |
| OAuth install | App installs and opens inside Shopify Admin without authentication loop. |
| Shop isolation | A request from Shop A cannot read or change Shop B’s offer data. |
| Uninstall | Session and app-owned shop configuration are cleaned safely and repeated delivery does not fail. |
| Webhook security | Invalid webhook signature is rejected; valid delivery succeeds. |
| Webhook retries | Replaying the same webhook does not duplicate events or attribution. |
| Secrets | No Admin API token, app secret, or database URL appears in browser/extension bundles or git. |

## Merchant Offer Flow

| Check | Pass condition |
| --- | --- |
| Create offer | Merchant can save a valid offer for their own shop. |
| Validation | Invalid configuration shows field errors and creates no offer. |
| Edit/pause | Updates persist; paused offers cannot be returned as eligible. |
| Schedule | Offer appears only inside its configured start/end period and timezone. |
| Priority | When more than one offer qualifies, deterministic configured priority selects the result. |
| Preview | Desktop/mobile preview reflects offer content without exposing data from another shop. |

## Eligibility Flow

Test each condition independently and in combination.

| Rule | Pass condition |
| --- | --- |
| Cart subtotal | Offer appears only at or above the configured subtotal. |
| Cart product/variant | Offer appears only when selected trigger item is in cart. |
| Collection | Cart product in qualifying collection is recognized correctly. |
| Customer tag | Tagged customer sees the offer; untagged customer does not. |
| Customer history | First-time and returning logic yields the correct outcome. |
| No match | Endpoint/widget returns a safe empty state, not an error. |

## Storefront Widget Flow

| Check | Pass condition |
| --- | --- |
| Installation | Merchant adds the app block through the Theme Editor; no manual theme-code edit is required. |
| Product page | Eligible Frequently Bought Together widget displays correct product/variant, price, and image. |
| Cart | Cart placement works in supported theme integration and degrades safely where unsupported. |
| Accept | Add-to-cart adds the intended variant once, with correct quantity and offer metadata. |
| Decline | Declining leaves cart unchanged and hides/dismisses offer as specified. |
| Mobile/accessibility | Controls are keyboard usable, labelled, responsive, and readable. |
| Events | Impression, view, accept, decline, and add-to-cart events are recorded once with correct shop/offer/placement. |

## Discount and Attribution Flow

| Check | Pass condition |
| --- | --- |
| Function configuration | Shopify Function receives valid configuration and returns only supported discount results. |
| Quantity/bundle/free gift | Eligible carts receive intended discount/gift; ineligible carts receive none. |
| Order attribution | Completed order containing accepted upsell is attributed to the right offer. |
| No false credit | Offer click without completed order does not create revenue attribution. |
| Analytics | Impression count, acceptance rate, attributed revenue, AOV lift, and filters agree with stored events/orders. |
| CSV export | Export matches active filters and contains only the current merchant’s data. |

## Checkout and Post-Purchase Flow

| Check | Pass condition |
| --- | --- |
| Plus gate | Non-Plus shops cannot configure checkout-step placement. |
| Checkout extension | Eligible Plus development store renders extension without blocking checkout or accessing Admin credentials in browser code. |
| Thank-you/order status | Extension renders only at currently supported targets. |
| Post-purchase flag | Feature is disabled by default and cannot render for unapproved/ineligible merchant. |
| One-click accept | Approved test store applies signed changeset once and completed order reflects the added item. |
| Failure path | Network/API/changeset failure shows safe error and lets buyer continue. |

## Completion Rule

A task is ready only when:

- Its relevant automated checks pass, or existing unrelated failures are explicitly listed.
- Every relevant checklist row above has a recorded result.
- Any Shopify plan, API, approval, or development-store limitation is documented.
- `IMPLEMENTATION_STEPS.md` is updated to mark only verified work as complete.

