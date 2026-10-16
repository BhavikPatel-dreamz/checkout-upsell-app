# Task 15 — Full Offer Regression Test

## Objective

Perform a complete regression test of the offer system after the refactor.

## Test Every Offer Type

For each type:

```text
Create
Edit
Load
Validate
Save
Publish
Generate Page
```

## Test Existing Data

Open existing offers created before the refactor.

Verify:

- Correct type
- Correct fields
- Correct values
- Correct editing
- Correct page generation

## Test Routes

Verify:

- Offer list
- New offer
- Edit offer
- Legacy routes

## Test Shopify

Verify existing Shopify functionality has not been affected.

## Technical Checks

Run:

```text
TypeScript
Lint
Unit tests
Integration tests
Production build
```

Fix regressions found during this task.

Do not introduce unrelated changes.