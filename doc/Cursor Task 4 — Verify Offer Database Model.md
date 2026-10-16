# Task 4 — Verify Offer Database Model

## Objective

Ensure the existing offer database model can support the unified offer architecture.

## First

Inspect the current Prisma schema and the findings from Task 1.

Determine whether:

```text
offerType
```

already exists.

## If the existing schema is sufficient

Do NOT change the database.

Simply verify that the current model supports:

- Multiple offer types
- Existing offers
- Create
- Edit
- Page generation

## If a change is genuinely required

Implement the minimum required Prisma migration.

Do not redesign the entire offer database.

Do not create separate tables for every offer type unless the existing architecture requires it.

## Existing Data

Verify that existing offers will continue working.

If migration is required:

- Preserve existing records.
- Provide safe defaults/backfill.
- Do not delete production data.

## Verification

Run:

- Prisma validation
- Migration validation
- TypeScript
- Existing tests

## Final Response

Clearly state one of:

```text
Database changes NOT required.
```

or:

```text
Database changes required.
```

If changes were made, list the migration and explain how existing data is preserved.