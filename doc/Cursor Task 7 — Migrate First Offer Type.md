# Task 7 — Migrate First Offer Type To Unified OfferForm

## Objective

Take the first existing offer type identified during Task 1 and migrate its type-specific form fields into the unified `OfferForm`.

Use the simplest/lowest-risk offer type first.

## Requirements

1. Identify the existing form for this offer type.
2. Extract only the type-specific fields.
3. Create a small type-specific field component if appropriate.
4. Render it from `OfferForm` based on `offerType`.
5. Preserve existing field behavior.
6. Preserve validation.
7. Preserve data format.
8. Do not change backend behavior yet.

Conceptually:

```tsx
switch (offerType) {
  case OfferType.POST:
    return <PostOfferFields />;
}
```

Use the project's preferred pattern instead of blindly using a switch.

## Important

The old form must remain available until the new implementation is verified.

Do not delete old routes.

## Verification

Test:

- Create UI
- Existing values
- Validation
- Form submission payload

Do not migrate the next offer type until this one is working.