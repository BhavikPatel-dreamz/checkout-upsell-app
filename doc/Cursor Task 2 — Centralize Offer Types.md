# Task 2 — Centralize Offer Types

## Objective

Create a single source of truth for all offer types currently supported by the application.

Use the findings from Task 1.

## Requirements

1. Identify the actual offer types currently used by the application.
2. Create a centralized `OfferType` definition following the existing TypeScript conventions.
3. Do not invent new offer types.
4. Replace duplicated/hardcoded offer type strings only where it is safe.
5. Do not refactor the forms yet.
6. Do not change routes yet.
7. Do not change the database yet unless Task 1 showed that the type definition already exists and only needs consolidation.

Example concept:

```ts
export enum OfferType {
  POST = "post",
  PRODUCT = "product",
  COLLECTION = "collection",
}
```

Use the project's actual types.

## Important

Do not implement the unified form yet.

Do not delete old offer routes.

Do not change offer behavior.

## Verification

Run:

- TypeScript check
- Lint
- Existing tests

Confirm existing functionality is unchanged.

## Final Response

Report:

- Centralized type location
- Offer types included
- Files changed
- Hardcoded references changed
- Tests/checks performed