# Shopify app development

This app is scaffolded from a Shopify app template. See the README for framework-specific details.

Use the [Shopify AI Toolkit](https://shopify.dev/docs/apps/build/ai-toolkit) for all Shopify API and platform work. If missing, install it in the agent host per that page (or `npx skills add Shopify/shopify-ai-toolkit --list` for skill-compatible hosts) — do not add tooling to this repo.

## Project: Checkout Upsell App

Checkout upsell app on React Router (ex-Remix template) — TypeScript, Prisma, Polaris. Two delivery tiers:

- **Standard** — the Shopify App Store-publishable product. Keep it generic and config-driven; no client-specific logic.
- **Enterprise** — per-client custom builds layered on top of Standard. Keep client-specific code isolated from the Standard core.

### Upsell surfaces (extensions)

- `extensions/pre-checkout-ui` — in-checkout upsell (`checkout_ui_extension`)
- `extensions/post-checkout-ui` — post-purchase upsell (`checkout_post_purchase`)
- `extensions/product-discount` — discount logic (`product_discounts` Function)

### Working agreement

- Features are delivered as discrete tasks, one at a time. Implement only the task at hand — do not build ahead of the current request.
- For every feature, keep the Standard vs Enterprise boundary explicit.

### Reference documentation

Read the relevant docs before working on the offer system, and keep them up to date when the code changes:

- `doc/OFFER_REFACTOR_TASKS.md` — master task-by-task execution plan for the offer refactor. It is the single source of truth for the unified offer architecture (types, config, form, validation, backend flow). Read it before starting any offer work and update it after completing a task (statuses: `NOT_STARTED` / `IN_PROGRESS` / `BLOCKED` / `COMPLETE` / `SKIPPED`).
- `doc/Cursor Task 1 … 16 — <title>.md` — per-task specs, one for each step of the refactor (analyze, centralize types, config, DB model, OfferForm foundation, common fields, per-type migration, unified route, backend, edit flow, list, legacy routes, deduplication, regression, final cleanup).
- `doc/Cursor - Claude Code Prompt — Refactor Offers Into One Dynamic Offer Form.md` — the original refactor brief / requirements.
- `tests/` — vitest specs covering the unified offer config, validation, and create/read/update/delete round-trips. Run with `npx vitest run tests/`.

Canonical offer code locations: `app/config/offerTypes.ts` (types/type config), `app/validation/offerSchemas.ts` (type-aware validation), `app/components/OfferForm.tsx` + `app/components/OfferTypeSelector.tsx` (unified form), `app/routes/app.offers_.new.tsx` (unified create/edit route), `app/models/offer.server.ts` (create/update/validation).
