# AI platform — discrete development tasks

Source of truth for execution. Blueprint: `doc/AI_PLATFORM_BLUEPRINT.md`.  
Statuses: `NOT_STARTED` | `IN_PROGRESS` | `BLOCKED` | `COMPLETE` | `SKIPPED`.

Working agreement: one task at a time. Standard vs Enterprise explicit. Do not implement later phases in a P1 PR.

---

## Phase 1 — Data foundation

| ID | Task | Status |
| --- | --- | --- |
| AI-1.1 | Write Prisma models: `ShopperEvent`, `ConsentState` (shop-scoped, indexes, no PII columns beyond opaque ids) | COMPLETE |
| AI-1.2 | Versioned event envelope types + Zod in `app/ai/events/` | COMPLETE |
| AI-1.3 | Dual-write: map existing `BrowseActivity` ingest (`api.activity`) into `ShopperEvent` without breaking ranker | COMPLETE |
| AI-1.4 | Expand pixel event names to P1 set (product_view, search, collection, ATC) with Customer Privacy check | COMPLETE |
| AI-1.5 | Theme/checkout emitters: batch POST `/api/ai/events` for recommendation_* and cart mutations (consent-gated) | COMPLETE |
| AI-1.6 | Identity: sessionId + anonId + customerId merge-on-login within shop (`IdentityLink`) | COMPLETE |
| AI-1.7 | Replace stub `webhooks.orders.create` / paid with HMAC-verified handlers that emit `purchase` + line items | COMPLETE |
| AI-1.8 | Attribution: link purchase lines to last `recommendationId` / offer within window; dual-write `OfferEvent.purchased` | COMPLETE |
| AI-1.9 | Consent + retention settings on shop; scheduled delete job for expired events | COMPLETE |
| AI-1.10 | GDPR redact path deletes events, activity, future profiles (shop + customer) | COMPLETE |
| AI-1.11 | Vitest: ingest, consent drop, identity merge, attribution window | COMPLETE |

**Phase 1 exit:** reliable shop-scoped behavioral data and purchase attribution. Ranking behavior unchanged unless explicitly tasked.

---

## Phase 2 — Smart recommendations

| ID | Task | Status |
| --- | --- | --- |
| AI-2.1 | Aggregate jobs: product-product and customer-product affinity tables | COMPLETE |
| AI-2.2 | `ProductIntelligence` from synced `ProductVariant` + Admin product fields (no embeddings yet) | COMPLETE |
| AI-2.3 | Relation builders: FBT, similar (co-view), complementary heuristic (category rules + FBT) | COMPLETE |
| AI-2.4 | Scoring function + tests (weights documented; inventory + in-cart penalty) | COMPLETE |
| AI-2.5 | Hybrid pipeline: business rules → candidates → score → merchant include/exclude/max N | COMPLETE |
| AI-2.6 | `MerchantRuleSet` admin UI (never / always / min margin if cost present / price band) | COMPLETE |
| AI-2.7 | Wire `ai_recommend` + eligibility to scored candidates **inside merchant pool first**, then optional catalog expand behind flag | COMPLETE |
| AI-2.8 | Keep LLM picker optional and **top-K only**; never candidate gen | COMPLETE |
| AI-2.9 | Embeddings + `pgvector` (or skip if BLOCKED on ops) — similar/complementary | COMPLETE |

---

## Phase 3 — Smart experiences

| ID | Task | Status |
| --- | --- | --- |
| AI-3.1 | `POST /api/ai/decide` response contract + holdout assignment | COMPLETE |
| AI-3.2 | Intent heuristics from events (states enum) + profile snapshot table | COMPLETE |
| AI-3.3 | Timing engine: dwell/scroll/exit/cart-value; default show=false if low expected value | COMPLETE |
| AI-3.4 | Experience selection: inline vs popup vs cart vs thank-you | COMPLETE |
| AI-3.5 | Campaign + Experience models wrapping/extending `Offer` (no duplicate offer form) | COMPLETE |
| AI-3.6 | Theme: PDP block + popup/sidebar/sticky with frequency cap | COMPLETE |
| AI-3.7 | Cart + thank-you consume decide API | COMPLETE |
| AI-3.8 | Checkout UI consume decide (Plus gated) | COMPLETE |
| AI-3.9 | Frequency + interruption budget stored per identity | COMPLETE |

---

## Phase 4 — AI offers & recovery

| ID | Task | Status |
| --- | --- | --- |
| AI-4.1 | Offer policy types under merchant max discount | COMPLETE |
| AI-4.2 | Function / discount application only for allowed policies | COMPLETE |
| AI-4.3 | Price/discount sensitivity features on profile | COMPLETE |
| AI-4.4 | Abandon risk heuristic + in-session recovery experience | COMPLETE |
| AI-4.5 | Recovery copy variants (reminder vs free ship vs accessory) chosen by reason heuristic | COMPLETE |

---

## Phase 5 — Optimization

| ID | Task | Status |
| --- | --- | --- |
| AI-5.1 | Always-on holdout when decide is enabled (default 10%, configurable) | COMPLETE |
| AI-5.2 | Experiment + assignment tables; A/B on experience variants | COMPLETE |
| AI-5.3 | Incrementality stats job + dashboard: incremental revenue, AOV, conversion | COMPLETE |
| AI-5.4 | Surface breakdown (PDP, cart, popup, thank-you, recovery) | NOT_STARTED |
| AI-5.5 | Optimization goal setting (revenue/AOV/conversion; profit if margin data) | NOT_STARTED |
| AI-5.6 | Bandit **with** holdout retained (do not ship bandit without holdout) | NOT_STARTED |

---

## Phase 6 — Copilot & Smart Moments

| ID | Task | Status |
| --- | --- | --- |
| AI-6.1 | Smart Moments detectors from affinity/lift; merchant Activate → campaign draft | NOT_STARTED |
| AI-6.2 | Copilot over aggregates (no raw events to LLM) | NOT_STARTED |
| AI-6.3 | “Create campaign from moment” uses unified OfferForm / Campaign | NOT_STARTED |
| AI-6.4 | Autopilot publish = Enterprise only; Standard always review | NOT_STARTED |

---

## Recommended first Cursor prompt

```
Read AGENTS.md, doc/AI_PLATFORM_BLUEPRINT.md, and doc/AI_PLATFORM_TASKS.md.
Implement only AI-1.1. Do not build recommenders, copilot, or new storefront UI.
```
