# Task Plan — Execute One Task at a Time

## Working Rule

Only one task may be **In progress**. Do not start the next task until:

1. The current task’s acceptance checks pass.
2. Relevant rows in `FLOW_CHECKLIST.md` are tested.
3. The task status below is updated.
4. The handoff records files changed, commands/results, and limitations.

Use `BUILD_PLAN.md` for technical rules and `IMPLEMENTATION_STEPS.md` for the broader phase checklist.

## Phase 0 — Foundation

| ID | Task | Depends on | Status | Acceptance check |
| --- | --- | --- | --- | --- |
| F0-01 | Establish baseline and configuration | — | Done | Repository reviewed; API version aligned; TypeScript passes. |
| F0-02 | Create app navigation and empty feature pages | F0-01 | Done | Dashboard, Offers, Analytics, Settings, and Onboarding pages compile as embedded app routes. |
| F0-03 | Add environment validation and setup documentation | F0-02 | Pending | App reports missing required variables safely; README gives repeatable local setup. |
| F0-04 | Complete secure lifecycle webhooks | F0-03 | Pending | Uninstall and mandatory GDPR webhooks verify signatures and are retry-safe. |
| F0-05 | Verify database migration workflow | F0-03 | Pending | Prisma generation and migration deployment work against development PostgreSQL. |

## Phase 1 — Offer Management

| ID | Task | Depends on | Status | Acceptance check |
| --- | --- | --- | --- | --- |
| O1-01 | Finalize offer data model and migration | F0-05 | Pending | Schema supports shop-scoped offers, products, rules, schedule, and status. |
| O1-02 | Offer service and server-side validation | O1-01 | Pending | Invalid data is rejected; all queries are restricted to current shop. |
| O1-03 | Offer list and create flow | O1-02 | Pending | Merchant creates a valid cross-sell offer and sees it in their list. |
| O1-04 | Offer edit, duplicate, pause, resume, delete | O1-03 | Pending | Each operation persists and paused offers cannot be eligible. |
| O1-05 | Product selector, rules, schedule, and preview | O1-04 | Pending | Merchant can configure products, targeting, priority, schedule, desktop/mobile preview. |

## Phase 2 — Eligibility and Storefront

| ID | Task | Depends on | Status | Acceptance check |
| --- | --- | --- | --- | --- |
| S2-01 | Pure eligibility rule engine with unit tests | O1-05 | Pending | All configured rules return the correct eligible/no-offer result. |
| S2-02 | Secure eligible-offer API | S2-01 | Pending | Endpoint returns only safe, current-shop offer data. |
| S2-03 | Theme App Extension scaffold | S2-02 | Pending | Extension validates and appears in Theme Editor. |
| S2-04 | Product-page Frequently Bought Together widget | S2-03 | Pending | Eligible widget renders, adds correct variant, and handles empty/error states. |
| S2-05 | Cart placement and storefront event tracking | S2-04 | Pending | Supported cart integration works; events are recorded once. |
| S2-06 | Storefront onboarding | S2-05 | Pending | Merchant gets Theme Editor deep link and setup guidance. |

## Phase 3 — Discounts and Analytics

| ID | Task | Depends on | Status | Acceptance check |
| --- | --- | --- | --- | --- |
| A3-01 | Replace legacy discount function with Standard configuration | S2-05 | Pending | Function uses configuration, has no client-specific behavior, and validates. |
| A3-02 | Implement supported quantity/bundle/free-gift discounts | A3-01 | Pending | Eligible development-store carts receive only intended discounts. |
| A3-03 | Event persistence and order attribution | A3-02 | Pending | Completed accepted upsells are attributed exactly once. |
| A3-04 | Analytics dashboard | A3-03 | Pending | Merchant sees correct impressions, conversion, attributed revenue, and AOV lift. |
| A3-05 | Filters and CSV export | A3-04 | Pending | Output respects current merchant and all selected filters. |

## Phase 4 — Checkout and Post-Purchase

| ID | Task | Depends on | Status | Acceptance check |
| --- | --- | --- | --- | --- |
| C4-01 | Replace legacy checkout extension | A3-03 | Pending | Secure Checkout UI Extension works on eligible Shopify Plus development store. |
| C4-02 | Add capability gates and checkout placement controls | C4-01 | Pending | Ineligible shops cannot enable checkout-step offers. |
| C4-03 | Add Thank-you and Order Status targets | C4-02 | Pending | Targets are verified against current Shopify availability and render correctly. |
| C4-04 | Replace post-purchase extension | C4-03 | Pending | Uses authenticated app requests; no hard-coded external endpoint or token exposure. |
| C4-05 | Post-purchase feature flag and live-access verification | C4-04 | Pending | Disabled by default; live enablement requires verified Shopify access. |

## Phase 5 — Release

| ID | Task | Depends on | Status | Acceptance check |
| --- | --- | --- | --- | --- |
| R5-01 | Full regression and development-store verification | C4-05 | Pending | All applicable `FLOW_CHECKLIST.md` rows pass. |
| R5-02 | App Store, privacy, and security review | R5-01 | Pending | App is reviewed against current Shopify App Store requirements. |
| R5-03 | Deployment documentation and release checklist | R5-02 | Pending | README provides reproducible deployment, rollback, and support steps. |

## Current Task

**F0-03 — Add environment validation and setup documentation**

When starting this task, inspect existing environment configuration and setup docs. Do not change database schema, legacy extensions, Shopify scopes, or production URLs as part of F0-03.
