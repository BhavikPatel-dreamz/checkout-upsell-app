# Checkout Upsell App — Build Plan

## Source of Truth and Agent Instructions

This is the source of truth for work on this project. Every agent must read this file and `AGENTS.md` before changing code.

The project is a Shopify React Router (formerly Remix) application using TypeScript, Prisma, and Polaris. For all Shopify platform/API work, agents must use the Shopify AI Toolkit as required by `AGENTS.md`. Do not add that tooling to this repository.

Deliver one discrete task at a time. Do not build later phases without an explicit request. Keep the Standard and Enterprise boundaries clear in code, UI, configuration, and documentation.

## Product Goal

Build a Shopify checkout upsell application that lets merchants create, deliver, and measure targeted offers across supported Shopify storefront and checkout surfaces.

Two delivery tiers:

- **Standard:** generic, configuration-driven, Shopify App Store-publishable product.
- **Enterprise:** isolated per-client customizations layered on top of Standard; never mix client-specific logic into the Standard core.

## Current Repository

Existing app and extensions:

```text
app/                              # React Router app routes and server code
prisma/schema.prisma              # Prisma database schema
extensions/pre-checkout-ui/       # Checkout UI extension
extensions/post-checkout-ui/      # Post-purchase extension
extensions/product-discount/      # Shopify product-discount Function
shopify.app.toml                  # Shopify app configuration
AGENTS.md                         # Mandatory project working agreement
```

Before changing an existing extension, inspect its `shopify.extension.toml`, source files, package manifest, and README where available. Preserve existing user changes unless the requested task explicitly modifies them.

## Initial Review Status — 2026-08-17

- The repository already has uncommitted Prisma schema and migration work. Preserve it unless the active task explicitly requires a database-model change.
- The app server uses Shopify API version `July26`; `shopify.app.toml` has been aligned to `2026-07` so webhook configuration does not point at a future API release.
- TypeScript validation passes with `npm run typecheck`.
- Lint currently fails with 98 errors, mainly in legacy `pre-checkout-ui` and `post-checkout-ui` code. These extensions use a hard-coded external API and an unsafe token-retrieval pattern. Do not extend or copy that design into Standard. Replace them in a dedicated, tested checkout-extension task.
- The Shopify AI Toolkit was checked and provides the relevant onboarding, Checkout UI Extension, Shopify Functions, Polaris app-home, and Shopify CLI skills. Use the appropriate one for future Shopify platform work.

## Technology Stack

- Shopify current React Router / Remix-style app template
- TypeScript, React, Shopify Polaris, Shopify App Bridge
- Prisma + PostgreSQL
- Shopify GraphQL Admin API
- Shopify CLI extensions
- Theme App Extension for storefront surfaces
- Checkout UI Extension for eligible checkout and post-order targets
- Post-purchase extension
- Shopify Functions for supported discount logic
- Vitest and Playwright for testing

## Shopify Surface Rules

| Surface | Primary implementation | Capability requirement |
| --- | --- | --- |
| Product page | Theme App Extension app block | Compatible Online Store 2.0 theme |
| Cart | Theme App Extension / theme-safe integration | Theme support varies |
| Checkout information, shipping, payment | Checkout UI Extension | Shopify Plus |
| Thank-you / order status | Checkout UI Extension targets | Target/plan availability must be checked |
| Post-purchase one-click offer | Post-purchase extension | Feature-flagged; live access may require approval |
| Discounts and gifts | Shopify Functions | Subject to Function API and plan constraints |

Rules:

- Never modify merchant theme source code. Use Theme App Extensions.
- Theme app extensions must not attempt to render on checkout pages.
- Checkout placement must be gated by merchant capability, particularly Shopify Plus for checkout steps.
- Post-purchase must remain feature-flagged until live-store eligibility is verified.
- Before implementing any Shopify platform capability, check current official Shopify documentation via the Shopify AI Toolkit.
- Use required GDPR webhooks and verify every webhook signature.
- Minimize PII and never expose Admin API credentials to storefront code.

## MVP Scope

### Included

1. Product-page “Frequently Bought Together” widget.
2. Cart upsell widget where theme support permits.
3. Offer types: cross-sell, bundle, quantity discount, free gift.
4. Targeting by cart subtotal, product, collection, customer tag, and first-time/returning status.
5. Merchant offer builder with status, priority, schedule, and preview.
6. Analytics: impressions, views, accepts, declines, attributed revenue, conversion, AOV lift.
7. Theme App Extension delivery.
8. Existing checkout/post-purchase extension paths, correctly gated.

### Deferred

- AI/ML recommendations and embeddings
- CRM, loyalty, reviews, subscription, and warehouse integrations
- Multi-step funnels and downsells
- Multi-store administration
- White-labeling and arbitrary CSS/JS injection
- Custom BI report builder and multiple attribution models

Do not begin a deferred item unless explicitly requested after the core MVP is complete.

## Architecture

```text
Shopify Admin
  -> Embedded app (React + Polaris)
       -> Offers, analytics, onboarding, settings
  -> Server routes/actions
       -> Authentication, Admin API, webhooks, offer eligibility API
  -> PostgreSQL + Prisma
       -> Shops, offers, rules, events, attribution
  -> Extensions
       -> Theme App Extension: product/cart widgets
       -> pre-checkout-ui: Plus checkout placement
       -> post-checkout-ui: feature-flagged post-purchase offer
       -> product-discount: discount / gift logic
```

## Target File Structure

Add files only as needed for the active task. This is the desired organization:

```text
app/
  routes/
    app._index.tsx                  # Dashboard
    app.offers._index.tsx           # Offer list
    app.offers.new.tsx              # Create offer
    app.offers.$offerId.tsx         # Edit offer
    app.analytics.tsx               # Analytics
    app.settings.tsx                # Capabilities and settings
    api.offers.eligible.ts          # Secure storefront eligibility API
    webhooks.*.tsx                  # Verified, idempotent webhook handlers
  features/
    offers/                         # CRUD, validation, merchant UI
    eligibility/                    # Rule evaluation
    analytics/                      # Event and attribution services
    shopify/                        # Admin API and capability helpers
  lib/
    env.server.ts                   # Environment validation
    webhook.server.ts               # HMAC verification/idempotency helpers
extensions/
  upsell-theme/                     # Future Theme App Extension
  pre-checkout-ui/                  # Existing checkout extension
  post-checkout-ui/                 # Existing post-purchase extension
  product-discount/                 # Existing Shopify Function
prisma/
  schema.prisma
  migrations/
tests/
  unit/
  integration/
  e2e/
```

## Data Model

Use normalized Prisma models. New models must include appropriate `shopId` ownership and indexes.

- `Shop`: domain, install state, feature/capability flags, configuration.
- `Offer`: name, status, type, priority, placement, display configuration.
- `OfferPlacement`: placement-specific settings.
- `OfferRule`: condition, operator, values, group/order.
- `OfferProduct`: chosen product/variant and sequence.
- `OfferSchedule`: start/end date and timezone.
- `OfferVariant`: future A/B testing support.
- `UpsellEvent`: immutable shopper events.
- `Attribution`: completed-order linkage and revenue.
- `Experiment` and `ExperimentVariant`: reserve for later A/B testing.

Required event fields: shop ID, offer ID, placement, event type, timestamp, anonymous cart/session ID when applicable, product/variant ID, and order ID when known.

## Eligibility and Recommendations

Evaluate eligibility on the server. Storefront code receives only a final, safe offer payload.

Supported initial conditions:

- Cart subtotal meets threshold.
- Specific product or variant is in the cart.
- Cart product belongs to selected collection(s).
- Customer has matching tag(s).
- Customer is first-time or returning.
- Offer is active, in schedule, and wins priority resolution.

Recommendations start with manually configured pairings and catalog relationships. AI is not part of the MVP.

## Delivery Phases

### Phase 0 — Foundation

1. Inspect the existing scaffold and extension configuration.
2. Configure environment validation, Prisma/PostgreSQL, and migrations.
3. Confirm Shopify OAuth/session handling.
4. Register and implement verified, idempotent webhooks:
   - app uninstall
   - product create/update/delete
   - order creation
   - customer updates only if required
   - Shopify GDPR mandatory webhooks
5. Establish embedded Polaris admin layout/navigation.
6. Document development-store and local setup.

**Exit criteria:** install/uninstall works safely; database migrations work; admin shell loads; automated checks pass.

### Phase 1 — Offer Management

1. Offer list and create/edit/duplicate/pause/resume flows.
2. Cross-sell, bundle, quantity, and free-gift configuration.
3. Server-side input validation and rule builder.
4. Product selection, placement, schedule, and priority.
5. Responsive desktop/mobile preview.

**Exit criteria:** a valid offer can be created and eligibility can be evaluated with supplied cart/customer context.

### Phase 2 — Storefront Delivery

1. Create `extensions/upsell-theme` as a Theme App Extension.
2. Product-page Frequently Bought Together app block.
3. Theme-safe cart offer integration.
4. Secure eligible-offer API.
5. Add-to-cart behavior and event tracking.
6. Responsive, accessible widget UI inheriting theme design tokens.
7. Merchant onboarding with Theme Editor deep links.

**Exit criteria:** merchant installation requires no theme-code change; an eligible shopper can accept an offer and tracking records the flow.

### Phase 3 — Discounts and Analytics

1. Extend the existing `product-discount` Function for supported discount/gift rules.
2. Record immutable events and handle order-webhook attribution.
3. Analytics filtering by date, offer, product, and placement.
4. Report conversion, attributed revenue, and AOV lift.
5. CSV export.

**Attribution definition:** revenue is attributed only if an accepted upsell item appears in the completed order. Display and document this assumption.

### Phase 4 — Checkout and Post-Purchase

1. Implement and test the existing `pre-checkout-ui` extension only for supported Plus checkout targets.
2. Add Thank-you and Order Status targets where currently supported.
3. Implement `post-checkout-ui` as a per-shop feature-flagged module.
4. Add capability checks and clear merchant feature-gate messages.
5. Verify Shopify approval/access before live post-purchase enablement.

**Exit criteria:** unavailable placements cannot be configured on ineligible stores.

### Phase 5 — Enterprise, Later

- Multi-step funnels/downsells
- Klaviyo, Recharge, Yotpo/Judge.me, loyalty, Segment/Amplitude integrations
- Multi-store controls
- Advanced reports/attribution
- AI personalization with an explicit privacy/data design

## Security and Quality Rules

- Authenticate and authorize every admin route/action by installed shop.
- Validate all mutation inputs server-side.
- Verify Shopify webhook HMAC signatures.
- Design webhook handlers for retry safety and idempotency.
- Implement Admin API rate-limit handling and safe retries.
- Index database queries by shop ID, offer status, event timestamp, and order ID.
- Provide loading, empty, error, and capability-gated UI states.
- Meet accessibility and mobile responsiveness requirements.

## Testing Requirements

After every active task or completed phase, run the repository’s appropriate lint, typecheck, and test commands. Do not invent scripts; first inspect `package.json`.

Required coverage:

- Unit: rule evaluator, schedules, validation, attribution.
- Integration: authorization, offer CRUD, eligibility API, webhook HMAC/idempotency.
- E2E: merchant creates offer; widget renders; shopper accepts; completed order is attributed.
- Extension validation and development-store test orders for checkout/post-purchase work.

## Agent Handoff Format

For every completed task, report:

1. Exact files changed.
2. Behavior implemented.
3. Commands run and results.
4. Remaining limitations, including Shopify plan/access restrictions.
5. Any update needed to this build plan.

## Initial Implementation Prompt

Use this when beginning work:

> Read `AGENTS.md` and `BUILD_PLAN.md` completely. Inspect the repository and existing Shopify extension configuration. Propose the exact file changes for Phase 0, then implement only the approved/current discrete task. Use the Shopify AI Toolkit for Shopify platform/API work. Preserve the Standard versus Enterprise boundary. Run the relevant lint, typecheck, and test commands from `package.json`, and report changed files, verification results, and blockers.
