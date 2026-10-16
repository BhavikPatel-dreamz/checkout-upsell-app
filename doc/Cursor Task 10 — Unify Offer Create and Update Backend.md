# Task 10 — Unify Offer Backend Processing

## Objective

Refactor the backend so the unified offer form can create/update all existing offer types without separate type-specific backend implementations where duplication exists.

## Requirements

Inspect existing:

- Remix actions
- API routes
- Services
- Prisma operations
- Validation

Create/reuse a unified offer processing flow.

Conceptually:

```text
Request
 ↓
Validate offerType
 ↓
Validate type-specific fields
 ↓
Create/Update Offer
 ↓
Existing page generation/publishing logic
```

Do not change existing business behavior.

Do not rewrite page generation.

Do not change Shopify integration unnecessarily.

## Security

Ensure:

- Store ownership is validated.
- User permissions are preserved.
- Invalid offer types are rejected.
- Invalid type-specific data is rejected.

## Verification

Test create and update for every existing offer type.