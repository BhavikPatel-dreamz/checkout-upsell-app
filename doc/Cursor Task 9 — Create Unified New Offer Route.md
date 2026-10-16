# Task 9 — Create Unified New Offer Route

## Objective

Create the single route responsible for creating offers.

Use the project's existing Remix routing conventions.

Target concept:

```text
/offers/new
```

The route should determine the offer type using the project's preferred mechanism, for example:

```text
/offers/new?type=post
```

## Requirements

The route must:

1. Determine the offer type.
2. Validate the type.
3. Render the unified `OfferForm`.
4. Pass the correct type to the form.
5. Preserve existing application authentication.
6. Preserve store context.

Do not yet remove old routes.

## Verification

Test every existing offer type:

```text
/offers/new?type=TYPE
```

Confirm each renders the correct form.

Run TypeScript, lint, and tests.