# Task 13 — Handle Legacy Offer Routes

## Objective

Safely transition from the old offer-specific routes to the unified route.

First identify all old routes such as:

```text
/offers/new-post
```

and their equivalents.

## Requirements

For every old route:

1. Determine whether it is still referenced.
2. Determine whether it may be used externally.
3. If necessary, redirect it to the unified route.

Example:

```text
/offers/new-post
        ↓
/offers/new?type=post
```

Do not break existing URLs unnecessarily.

## Verification

Test every legacy route.

Confirm it reaches the correct unified form.