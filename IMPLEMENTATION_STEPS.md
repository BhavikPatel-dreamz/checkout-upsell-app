# Implementation Steps

Read `AGENTS.md` and `BUILD_PLAN.md` before starting any task. Work through these steps in order. A step is complete only when its matching checks in `FLOW_CHECKLIST.md` pass.

## 0. Project Baseline

- [x] Review the repository, app configuration, schema, migrations, and extensions.
- [x] Align `shopify.app.toml` webhook API version with the application server (`2026-07`).
- [ ] Confirm `.env` values are documented without committing secrets.
- [ ] Confirm PostgreSQL is reachable and `prisma migrate deploy` works in a non-production environment.
- [x] Replace generic template navigation with Dashboard, Offers, Analytics, Settings, and Onboarding.
- [ ] Verify app uninstall removes sessions and app-owned shop data safely.
- [ ] Add mandatory GDPR webhook routes/configuration.

## 1. Offer Data and Admin API

- [ ] Review the existing `Offer` schema before modifying it; preserve existing migration work.
- [ ] Define an offer service with shop-scoped reads/writes.
- [ ] Add server-side validation for offer name, type, placement, products, rules, schedule, and priority.
- [ ] Build Offer list page.
- [ ] Build Create Offer page.
- [ ] Build Edit, duplicate, pause, resume, and delete operations.
- [ ] Add product/variant selector using authenticated Admin GraphQL queries.
- [ ] Add placement, scheduling, and responsive preview controls.

## 2. Eligibility Engine

- [ ] Implement a pure, tested rule evaluator.
- [ ] Support cart subtotal, product/variant, collection, customer tag, first-time/returning, active state, schedule, and priority.
- [ ] Return no offer if requirements cannot be safely evaluated.
- [ ] Create a protected app endpoint that returns only safe eligible-offer data to extension clients.

## 3. Storefront Theme Extension

- [ ] Generate a dedicated Theme App Extension under `extensions/upsell-theme`.
- [ ] Build the Frequently Bought Together product-page app block.
- [ ] Build theme-safe cart placement behavior.
- [ ] Implement add-to-cart and decline interactions.
- [ ] Send impression, view, accept, decline, and add-to-cart events to the app server.
- [ ] Add accessible loading, empty, and error states.
- [ ] Add onboarding deep links to the Theme Editor.

## 4. Discounts and Analytics

- [ ] Review and replace legacy client-specific logic in `extensions/product-discount` with configuration-driven Standard behavior.
- [ ] Implement only Shopify Function-supported bundle, quantity, discount, and free-gift rules.
- [ ] Make event writes idempotent.
- [ ] Process completed-order webhooks to attribute accepted upsells.
- [ ] Build analytics for impressions, acceptance rate, attributed revenue, conversion rate, and AOV lift.
- [ ] Add date/offer/product/placement filters and CSV export.

## 5. Checkout and Post-Purchase Extensions

- [ ] Replace legacy `pre-checkout-ui` code with a secure, current Checkout UI Extension implementation.
- [ ] Gate checkout-step placement by Shopify Plus capability.
- [ ] Add Thank-you and Order Status targets only after validating their current Shopify availability.
- [ ] Replace legacy `post-checkout-ui` code with a session-token-authenticated, feature-flagged implementation.
- [ ] Enable post-purchase only after required Shopify live-store approval/access is confirmed.

## 6. Release Readiness

- [ ] Run all automated checks.
- [ ] Test installation, onboarding, storefront, discounts, analytics, and gated checkout flows in a development store.
- [ ] Run Shopify configuration/extension validation through Shopify CLI.
- [ ] Review App Store requirements and privacy data handling.
- [ ] Update `README.md`, `BUILD_PLAN.md`, and this file with final setup and limitations.
