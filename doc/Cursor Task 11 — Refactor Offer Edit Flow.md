# Task 11 — Refactor Offer Edit Flow

## Objective

Make the existing offer edit flow use the same `OfferForm`.

## Requirements

When editing:

```text
Existing Offer
 ↓
Load Offer
 ↓
Read offer.type
 ↓
Unified OfferForm
 ↓
Populate existing data
 ↓
Update
```

The form must automatically render the correct type-specific fields.

Do not create separate edit forms.

Preserve:

- Existing data
- Validation
- Store permissions
- Shopify integration
- Page generation

## Verification

Edit at least one existing offer of every supported type.

Verify no data is lost.

Run TypeScript, lint, and tests.