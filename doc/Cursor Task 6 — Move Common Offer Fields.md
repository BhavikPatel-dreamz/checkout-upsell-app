# Task 6 — Move Common Offer Fields Into Unified OfferForm

## Objective

Move fields shared by the existing offer types into the new `OfferForm`.

Use the actual fields discovered in Task 1.

Examples may include:

```text
Title
Description
Image
Status
Start Date
End Date
```

Do not assume these are all common.

## Requirements

1. Identify genuinely shared fields.
2. Implement them once inside `OfferForm`.
3. Reuse existing UI components.
4. Reuse existing validation where possible.
5. Preserve existing field behavior.
6. Do not change database behavior.

## Important

Do not remove the old forms yet.

Do not migrate type-specific fields yet.

The objective is only to establish the shared form fields.

## Verification

Test that the new form renders correctly for at least two existing offer types.

Run TypeScript, lint, and tests.