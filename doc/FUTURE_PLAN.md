# Future plan (deferred)

This file is the parking lot for work we **will add later**. Do not implement these as part of activity-ranked Standard upsells.

Keep the Standard vs Enterprise boundary: Standard stays generic and config-driven; Enterprise is per-client and isolated from the Standard core.

---

## 1. LLM-generated offers

- Suggest new offer configs (trigger products, upsell SKUs, copy, discount) from catalog + activity.
- Merchant review/approve before anything goes live (unless Autopilot is explicitly enabled later).
- Depends on: activity store, product sync, unified OfferForm.

## 2. Autopilot publish

- Create and publish offers with little merchant review.
- Needs: guardrails (max discount, inventory, brand rules), kill switch, audit log.
- Treat as **Enterprise** unless a very conservative Standard opt-in is designed separately.

## 3. Checkout-page pre-purchase UI

- `displayLocation: checkout_page` / Checkout UI on the checkout step (not only cart theme block).
- Keep cart + thank-you as they are; this is an extra surface.
- Eligibility already ignores display location in places — wire a real filter when this ships.

## 4. True post-purchase order edit

- Add to the **order just placed** (not a new cart/checkout).
- Requires `checkout_post_purchase` (or equivalent Shopify order-edit path). Not the thank-you block.
- Thank-you CTA stays “new checkout” until this exists.

## 5. Enterprise per-client models

- Isolated ranking/LLM per client (custom weights, catalogs, prompts).
- No cross-shop training in Standard.
- Keep client code out of Standard eligibility, pixel, and analytics.

---

## Suggested later task order

1. Checkout-page pre-purchase UI (platform surface; reuses ranker).
2. LLM-generated offer drafts in admin (still merchant-published).
3. True post-purchase order edit extension.
4. Enterprise per-client models + optional Autopilot.

When starting any of these, add a discrete task spec under `doc/` and do not mix it into a Standard ranking PR.
