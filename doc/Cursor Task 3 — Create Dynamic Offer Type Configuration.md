# Task 3 — Create Offer Type Configuration

## Objective

Create a centralized configuration for the existing offer types.

This configuration will later be consumed by the unified `OfferForm`.

Use the actual offer types and fields discovered during Task 1.

## Requirements

Create a configuration that can describe:

```text
type
label
description
common fields
type-specific fields
```

Example structure:

```ts
{
  post: {
    label: "...",
    fields: [...]
  },

  product: {
    label: "...",
    fields: [...]
  }
}
```

Do not build a generic form-builder framework.

Do not over-engineer.

The configuration should simply provide a clean central definition that the unified form can use later.

## Important

Do not replace existing forms yet.

Do not change existing routes.

Do not change backend behavior.

## Verification

Run:

- TypeScript
- Lint
- Existing tests

## Final Response

Report:

- Configuration location
- Supported types
- Fields identified for each type
- Files changed
- Verification results