# Task 14 — Remove Duplicate Offer Implementations

## Objective

Clean up the old duplicated offer implementations now that the unified system is proven to work.

## Before Deleting Anything

Search the entire project for references to:

```text
app.offers_.new.tsx
app.offers_.new-post.tsx
```

and all other obsolete offer routes/components.

## Remove Only

Files that:

- Are fully replaced.
- Are no longer imported.
- Are no longer referenced.
- Are not required for backward compatibility.

Do not delete useful type-specific field components.

The desired architecture is:

```text
ONE Offer List
ONE Create Flow
ONE OfferForm
ONE Offer Type System
ONE Create/Update Flow
```

with small reusable type-specific components where necessary.

## Verification

Run:

- TypeScript
- Lint
- Tests
- Build

Search again for dead references.