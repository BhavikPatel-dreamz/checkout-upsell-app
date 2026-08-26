# Task 12 — Refactor Offer List

## Objective

Ensure the offer list works cleanly with the unified offer architecture.

Keep:

```text
app.offers.tsx
```

or its equivalent as the single offer list.

## Requirements

Show all existing offer types in one list.

Where appropriate display:

```text
Offer
Type
Status
Dates
Actions
```

Use the centralized `OfferType`.

Update Create Offer navigation so it opens the unified creation flow.

Do not create separate lists by offer type.

## Verification

Test:

- List loading
- Type display
- Create navigation
- Edit navigation
- Existing offers