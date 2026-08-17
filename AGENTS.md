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
