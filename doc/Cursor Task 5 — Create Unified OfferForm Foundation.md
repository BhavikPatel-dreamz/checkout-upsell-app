# Task 5 — Create Unified OfferForm Foundation

## Objective

Create the reusable foundation for a single `OfferForm`.

Do not migrate all existing forms yet.

## Requirements

Create a reusable form component following the existing project architecture.

It should support:

```ts
mode: "create" | "edit"
offerType: OfferType
initialData?: Offer
```

Conceptually:

```tsx
<OfferForm
  mode="create"
  offerType={offerType}
/>
```

and:

```tsx
<OfferForm
  mode="edit"
  offerType={offer.type}
  initialData={offer}
/>
```

## Structure

Create reusable sections for:

```text
OfferForm
├── CommonOfferFields
├── TypeSpecificFields
└── OfferActions
```

Do not migrate existing type-specific fields yet.

Initially, build the foundation using the existing common fields.

## Important

Do not remove existing forms.

Do not change existing routes.

Do not change backend actions.

The old implementation must continue working.

## Verification

Run:

- TypeScript
- Lint
- Tests

## Final Response

Report:

- OfferForm location
- Components created
- Props/API
- Common fields implemented
- Verification results