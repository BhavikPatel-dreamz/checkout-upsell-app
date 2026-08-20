# Shopify Offer System Refactor — Task-by-Task Execution Plan

## Purpose

This file is the single source of truth for refactoring the current Shopify offer system into a unified, extensible offer architecture.

The coding agent (Cursor / Claude Code) MUST read this file before starting work and MUST update it after completing each task.

The implementation must be performed incrementally.

**Do not execute all tasks at once.**

---

# 1. Project Goal

Current implementation contains multiple offer-related routes/forms, for example:

```text
app.offers.tsx
app.offers_.new.tsx
app.offers_.new-post.tsx
```

The target architecture is:

```text
Offer List
    ↓
Create Offer
    ↓
Select Offer Type
    ↓
Unified OfferForm
    ↓
Type-specific fields
    ↓
Unified Create/Update flow
    ↓
Database
    ↓
Existing offer/page-generation system
```

The goal is NOT necessarily to have one enormous React file.

The goal is:

- One offer management architecture
- One unified create/edit form flow
- One centralized offer type definition
- Shared common fields
- Reusable type-specific field components
- Shared validation
- Shared create/update processing
- No duplicated full forms
- No unnecessary route per offer type
- Existing offers remain functional
- Existing Shopify/page-generation behavior remains functional

---

# 2. Important Product Context

The broader product architecture is intended to become an AI-powered Shopify upsell and revenue optimization platform.

The offer engine is expected to eventually support concepts such as:

- Manual Offers
- AI Generated Offers
- Discount Offers
- Bundle Offers
- Free Gift
- Dynamic Offers

The broader architecture also anticipates offer lifecycle states and eventually offer versions.

Do NOT implement the full AI/Autopilot system as part of this refactor.

However, the new offer architecture must not prevent those future capabilities.

Reference source architecture:

```text
Offer Engine
    ├── Manual Offers
    ├── AI Generated Offers
    ├── Discount Offers
    ├── Bundle Offers
    ├── Free Gift
    └── Dynamic Offers
```

---

# 3. Agent Working Rules

Before starting any task:

1. Read this file.
2. Read the task status.
3. Read the previous task's completion notes.
4. Inspect the actual codebase.
5. Do not assume the codebase matches this document exactly.
6. Preserve existing project conventions.
7. Reuse existing components/services/utilities.
8. Avoid unrelated refactoring.
9. Do not delete code until its replacement is verified.
10. Run the relevant checks after implementation.

After completing a task:

1. Update this file.
2. Mark the task status.
3. Record what changed.
4. Record files created/modified/deleted.
5. Record tests/checks performed.
6. Record any decisions or assumptions.
7. Record any blockers or follow-up work.
8. Add the date/time if the project uses timestamps.
9. Do not mark a task COMPLETE unless it has actually been verified.

---

# 4. Status Definitions

Use only these statuses:

- `NOT_STARTED`
- `IN_PROGRESS`
- `BLOCKED`
- `COMPLETE`
- `SKIPPED`

Example:

```text
Status: COMPLETE
```

A task can only move from:

```text
NOT_STARTED
    ↓
IN_PROGRESS
    ↓
COMPLETE
```

If something prevents completion:

```text
IN_PROGRESS
    ↓
BLOCKED
```

---

# 5. Global Progress

Update this section whenever a task is completed.

```text
Current Task: TASK 1
Completed Tasks: 0 / 16
Blocked Tasks: 0
```

---

# 6. Current Architecture Snapshot

This section should be updated by TASK 1 after inspecting the actual project.

## Current Offer Types

```text
TBD — TASK 1
```

## Current Offer Routes

```text
TBD — TASK 1
```

## Current Offer Components

```text
TBD — TASK 1
```

## Current Backend Flow

```text
TBD — TASK 1
```

## Current Database Model

```text
TBD — TASK 1
```

## Current Page Generation Flow

```text
TBD — TASK 1
```

## Current Shopify Integration

```text
TBD — TASK 1
```

---

# TASK 1 — Analyze Existing Offer Architecture

## Status

```text
NOT_STARTED
```

## Objective

Understand the current offer implementation before making changes.

This is an investigation-only task.

## CRITICAL RULE

Do NOT:

- Modify files
- Delete files
- Rename files
- Refactor code
- Change database schema
- Change routes

## Inspect

Search the entire project for:

```text
offers
offer
offerType
new-post
```

Inspect:

- Offer list
- Offer creation routes
- Offer edit routes
- Offer forms
- Offer components
- Loaders
- Actions
- APIs
- Validation
- Prisma models
- Shopify integration
- Offer page-generation code
- Offer publishing code
- Navigation

## Determine

### A. Current Offer Types

List every existing type.

### B. Current Routes

Document:

| Route/File | Purpose | Offer Type | Create/Edit | Dependencies |
|---|---|---|---|---|

### C. Current Forms

Document:

- Common fields
- Type-specific fields
- Reusable components
- Duplicated form logic

### D. Backend

Document:

- Create flow
- Update flow
- Delete/archive flow
- Validation
- Database operations

### E. Database

Document:

- Offer model
- Related models
- Type field
- Status
- Configuration/data
- Relationships

### F. Page Generation

Document:

```text
Offer
 ↓
Page Generation
 ↓
Storage
 ↓
Publishing
```

Explain where offer type is used.

### G. Shopify Integration

Document Shopify calls related to offers.

### H. Risks

Identify:

- Production URLs that may depend on old routes
- Existing data compatibility issues
- Page-generation dependencies
- Shopify dependencies
- Potential breaking changes

## Required Output

Produce an architecture report in this file or in the final task response, then update this section.

## Completion Checklist

- [ ] Current offer types identified
- [ ] Current routes identified
- [ ] Forms identified
- [ ] Backend flow identified
- [ ] Prisma model identified
- [ ] Page-generation flow identified
- [ ] Shopify integration identified
- [ ] Duplication identified
- [ ] Risks identified

## Completion Notes

```text
TBD
```

---

# TASK 2 — Centralize Offer Types

## Status

```text
NOT_STARTED
```

## Objective

Create one source of truth for all currently supported offer types.

Use the actual types discovered in TASK 1.

## Requirements

Create/reuse:

```text
OfferType
```

Use project conventions.

Do not invent new types.

Replace scattered hardcoded type strings only where safe.

## Do NOT

- Create the unified form
- Change routes
- Remove old forms
- Change business behavior
- Redesign the database unless TASK 1 proves this is necessary

## Verification

Run:

- TypeScript check
- Lint
- Existing tests

## Completion Checklist

- [ ] Centralized OfferType exists
- [ ] Existing types represented
- [ ] Safe references updated
- [ ] No behavior change
- [ ] TypeScript passes
- [ ] Lint passes
- [ ] Tests pass

## Completion Notes

```text
TBD
```

## Files Changed

```text
TBD
```

---

# TASK 3 — Create Offer Type Configuration

## Status

```text
NOT_STARTED
```

## Objective

Create centralized configuration describing each offer type.

The configuration will later be consumed by the unified OfferForm.

## Configuration Should Support

At minimum:

```text
type
label
description
type-specific fields
```

Use the actual project requirements from TASK 1.

## Example Concept

```ts
{
  post: {
    label: "Post",
    fields: [...]
  },
  product: {
    label: "Product",
    fields: [...]
  }
}
```

This is conceptual only. Follow the project's architecture.

## Do NOT

- Build a generic form-builder framework
- Replace all forms yet
- Change routes
- Change backend behavior

## Verification

Run:

- TypeScript
- Lint
- Existing tests

## Completion Checklist

- [ ] Configuration created
- [ ] Existing types represented
- [ ] Actual fields documented
- [ ] No unnecessary abstraction
- [ ] TypeScript passes
- [ ] Lint passes
- [ ] Tests pass

## Completion Notes

```text
TBD
```

---

# TASK 4 — Verify Offer Database Model

## Status

```text
NOT_STARTED
```

## Objective

Ensure the current Prisma/database model can support the unified offer architecture.

## First Determine

Does the current offer model already have:

```text
offerType
```

?

### If YES

Do not change the database unnecessarily.

Verify existing data and behavior are compatible.

### If NO

Only implement the minimum required schema/migration change.

## Important

Do NOT:

- Redesign the entire offer schema
- Create separate tables for every type without a real requirement
- Destroy existing data
- Perform destructive migrations

## Existing Data

Verify how existing offers are typed.

If necessary, create a safe backfill/migration.

## Verification

Run:

- Prisma validation
- Migration validation
- TypeScript
- Existing tests

## Completion Checklist

- [ ] Existing schema inspected
- [ ] Type support verified
- [ ] Existing data checked
- [ ] Migration added only if necessary
- [ ] Migration is safe
- [ ] TypeScript passes
- [ ] Tests pass

## Completion Notes

```text
TBD
```

---

# TASK 5 — Create Unified OfferForm Foundation

## Status

```text
NOT_STARTED
```

## Objective

Create the reusable OfferForm foundation.

## Required API

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

Follow the actual project architecture.

## Suggested Structure

```text
OfferForm
├── CommonOfferFields
├── TypeSpecificFields
└── OfferActions
```

Small type-specific components are acceptable.

## Do NOT

- Remove old forms
- Change routes
- Change backend
- Break existing functionality

## Completion Checklist

- [ ] OfferForm created
- [ ] Create/edit modes supported
- [ ] OfferType accepted
- [ ] Existing UI components reused
- [ ] No old implementation removed
- [ ] TypeScript passes
- [ ] Lint passes
- [ ] Tests pass

## Completion Notes

```text
TBD
```

---

# TASK 6 — Move Common Offer Fields

## Status

```text
NOT_STARTED
```

## Objective

Move fields shared across current offer types into the unified OfferForm.

Use TASK 1 findings.

Do not assume a field is common without checking.

## Requirements

- Implement shared fields once
- Preserve current behavior
- Reuse existing components
- Reuse existing validation
- Keep old forms working until verification

## Do NOT

- Migrate all type-specific fields
- Remove old routes
- Change backend behavior

## Completion Checklist

- [ ] Common fields identified
- [ ] Common fields implemented
- [ ] Existing behavior preserved
- [ ] Validation preserved
- [ ] TypeScript passes
- [ ] Lint passes
- [ ] Tests pass

## Completion Notes

```text
TBD
```

---

# TASK 7 — Migrate First Offer Type

## Status

```text
NOT_STARTED
```

## Objective

Migrate the simplest/lowest-risk existing offer type into OfferForm.

Choose the actual type based on TASK 1.

## Requirements

- Extract type-specific fields
- Create a type-specific field component if useful
- Render from OfferForm based on OfferType
- Preserve validation
- Preserve existing data shape
- Preserve UI behavior

## Do NOT

- Delete old implementation yet
- Modify unrelated offer types
- Change backend unless absolutely required

## Verification

Test:

- Render
- Existing values
- Validation
- Submission payload
- Data persistence if connected

## Completion Checklist

- [ ] First type migrated
- [ ] Correct fields shown
- [ ] Existing values work
- [ ] Validation works
- [ ] Submission works
- [ ] Tests pass

## Completion Notes

```text
TBD
```

---

# TASK 8 — Migrate Remaining Offer Types

## Status

```text
NOT_STARTED
```

## Execution Rule

Run this task ONE OFFER TYPE AT A TIME.

Do not migrate several types in an uncontrolled batch.

## Objective

Migrate one remaining offer type into OfferForm.

## Requirements

- Inspect current implementation
- Move type-specific fields
- Preserve validation
- Preserve data shape
- Preserve behavior

## Verification

Test:

- Render
- Existing values
- Validation
- Submission
- Persistence
- Edit behavior where applicable

## Completion Checklist

For each type:

- [ ] Type migrated
- [ ] Fields verified
- [ ] Validation verified
- [ ] Submission verified
- [ ] Existing data verified
- [ ] Tests pass

## Per-Type Notes

```text
Type: TBD
Status: TBD
Notes: TBD
```

Add another block for every migrated type.

---

# TASK 9 — Create Unified New Offer Route

## Status

```text
NOT_STARTED
```

## Objective

Create the single unified creation route.

Target concept:

```text
/offers/new
```

Use actual Remix route conventions.

## Type Selection

The route may use a mechanism such as:

```text
/offers/new?type=post
```

or the existing project's preferred approach.

## Requirements

- Determine offer type
- Validate offer type
- Render OfferForm
- Preserve authentication
- Preserve store context

## Do NOT

Remove legacy routes yet.

## Verification

Test every offer type.

## Completion Checklist

- [ ] Unified new route created
- [ ] Type selection works
- [ ] Every type renders correctly
- [ ] Auth preserved
- [ ] Store context preserved
- [ ] Tests pass

## Completion Notes

```text
TBD
```

---

# TASK 10 — Unify Create/Update Backend

## Status

```text
NOT_STARTED
```

## Objective

Allow the unified form to use a unified create/update backend flow where duplication currently exists.

## Process

```text
Request
 ↓
Validate offerType
 ↓
Validate type-specific fields
 ↓
Create/Update Offer
 ↓
Existing page-generation/publishing logic
```

## Preserve

- Authentication
- Authorization
- Store isolation
- Shopify integration
- Existing data
- Existing business logic

## Security

Validate:

- Store ownership
- User permission
- Valid offer type
- Valid type-specific data

## Verification

Test create/update for every type.

## Completion Checklist

- [ ] Unified create processing
- [ ] Unified update processing
- [ ] Type validation
- [ ] Store authorization
- [ ] Existing page generation preserved
- [ ] All types tested
- [ ] Tests pass

## Completion Notes

```text
TBD
```

---

# TASK 11 — Refactor Offer Edit Flow

## Status

```text
NOT_STARTED
```

## Objective

Use the same OfferForm for editing every offer type.

## Required Flow

```text
Existing Offer
 ↓
Load
 ↓
Read offer.type
 ↓
OfferForm
 ↓
Populate data
 ↓
Update
```

## Requirements

- Correct type detected
- Correct fields rendered
- Existing values populated
- Validation preserved
- Update works
- No data lost

## Verification

Edit at least one existing offer for every supported type.

## Completion Checklist

- [ ] Edit route uses OfferForm
- [ ] Type detection works
- [ ] Existing values load
- [ ] Validation works
- [ ] Update works
- [ ] Existing data preserved
- [ ] Tests pass

## Completion Notes

```text
TBD
```

---

# TASK 12 — Refactor Offer List

## Status

```text
NOT_STARTED
```

## Objective

Keep one offer list for all offer types.

The existing list route should remain the primary offer list unless code inspection shows otherwise.

## Display

Where appropriate:

```text
Offer
Type
Status
Dates
Actions
```

## Requirements

- All offer types shown
- Centralized OfferType used
- Create navigation points to unified create flow
- Edit navigation points to unified edit flow

## Completion Checklist

- [ ] All types listed
- [ ] Type displayed correctly
- [ ] Create link updated
- [ ] Edit link updated
- [ ] Existing list behavior preserved
- [ ] Tests pass

## Completion Notes

```text
TBD
```

---

# TASK 13 — Handle Legacy Offer Routes

## Status

```text
NOT_STARTED
```

## Objective

Safely transition old offer-specific routes to the unified route.

## Process

Search all old routes.

For each route determine:

- Is it referenced?
- Is it externally accessible?
- Is it bookmarked/likely used?
- Can it safely be removed?
- Does it require redirect?

## Preferred Pattern

Example:

```text
/offers/new-post
        ↓
/offers/new?type=post
```

## Do NOT

Delete routes before dependency analysis.

## Completion Checklist

- [ ] Old routes identified
- [ ] Internal references checked
- [ ] External compatibility considered
- [ ] Redirects created where needed
- [ ] Broken links checked
- [ ] Tests pass

## Completion Notes

```text
TBD
```

---

# TASK 14 — Remove Duplicate Implementations

## Status

```text
NOT_STARTED
```

## IMPORTANT

Do this only after Tasks 1–13 are verified.

## Objective

Remove duplicated offer implementations that are completely replaced.

## Before Deleting

Search entire project for all references.

Potential examples:

```text
app.offers_.new.tsx
app.offers_.new-post.tsx
```

Also search for other duplicate routes/components.

## Keep

Reusable type-specific components such as:

```text
PostOfferFields
ProductOfferFields
CollectionOfferFields
```

if they are part of the unified architecture.

## Remove Only

Code that is:

- Fully replaced
- Not imported
- Not referenced
- Not required for compatibility

## Verification

Run:

- TypeScript
- Lint
- Tests
- Production build

## Completion Checklist

- [ ] Duplicate files identified
- [ ] References checked
- [ ] Obsolete files removed
- [ ] Dead imports removed
- [ ] No broken routes
- [ ] Build passes
- [ ] Tests pass

## Completion Notes

```text
TBD
```

---

# TASK 15 — Full Regression Test

## Status

```text
NOT_STARTED
```

## Objective

Perform a complete regression test after refactoring.

## For Every Offer Type

Test:

```text
Create
 ↓
Save
 ↓
Load
 ↓
Edit
 ↓
Save
 ↓
Publish
 ↓
Generate/View Page
```

## Existing Data

Open offers created before the refactor.

Verify:

- Type
- Fields
- Values
- Editing
- Publishing
- Page generation

## Routes

Verify:

- Offer list
- New offer
- Edit offer
- Legacy routes

## Shopify

Verify existing Shopify behavior.

## Technical Checks

Run:

```text
TypeScript
Lint
Unit tests
Integration tests
Production build
```

## Completion Checklist

- [ ] Every offer type tested
- [ ] Existing offers tested
- [ ] Create tested
- [ ] Edit tested
- [ ] Publish tested
- [ ] Page generation tested
- [ ] Legacy routes tested
- [ ] TypeScript passes
- [ ] Lint passes
- [ ] Tests pass
- [ ] Production build passes

## Completion Notes

```text
TBD
```

---

# TASK 16 — Final Cleanup and Documentation

## Status

```text
NOT_STARTED
```

## Objective

Finalize and document the architecture.

## Confirm Final Architecture

```text
Offer List
    ↓
Create Offer
    ↓
Offer Type
    ↓
Unified OfferForm
    ↓
Type-specific Fields
    ↓
Unified Backend
    ↓
Database
    ↓
Existing Page Generation
```

## Review Duplication

Search for:

```text
offer form
new-post
new-product
new-collection
offerType
```

Remove only unnecessary duplication.

## Developer Documentation

Document:

- Supported offer types
- Central OfferType location
- Offer type configuration
- Common form fields
- Type-specific field locations
- Validation
- Create flow
- Edit flow
- Backend processing
- How to add a future offer type

## Future Type Addition

The final documentation should explain how to add a new type without creating a completely new route and full form.

## Final Verification

Run:

- TypeScript
- Lint
- Tests
- Build

## Completion Checklist

- [ ] Architecture reviewed
- [ ] Duplication reviewed
- [ ] Documentation added
- [ ] New-type instructions added
- [ ] TypeScript passes
- [ ] Lint passes
- [ ] Tests pass
- [ ] Build passes

## Completion Notes

```text
TBD
```

---

# 7. Decision Log

Use this section for decisions that affect future tasks.

Format:

```text
## YYYY-MM-DD — Decision

Decision:
Reason:
Affected Tasks:
Files:
```

Current entries:

```text
TBD
```

---

# 8. Assumptions

Record only assumptions that were actually made.

```text
TBD
```

---

# 9. Blockers

Record blockers here.

Format:

```text
## Task X

Blocker:
Impact:
What is needed:
Status:
```

Current blockers:

```text
None
```

---

# 10. Files Changed

Maintain a high-level record.

```text
## Created

TBD

## Modified

TBD

## Deleted

TBD
```

---

# 11. Test History

Record meaningful verification.

Format:

```text
## Task X — YYYY-MM-DD

Checks:
- TypeScript:
- Lint:
- Unit Tests:
- Integration Tests:
- Build:

Result:
```

Current history:

```text
TBD
```

---

# 12. Final Target Architecture

The desired end state is:

```text
                     ┌──────────────────────┐
                     │      Offers List     │
                     └──────────┬───────────┘
                                │
                                ▼
                     ┌──────────────────────┐
                     │   Create / Edit      │
                     └──────────┬───────────┘
                                │
                                ▼
                     ┌──────────────────────┐
                     │      Offer Type      │
                     │   Centralized Enum   │
                     └──────────┬───────────┘
                                │
                                ▼
                     ┌──────────────────────┐
                     │     OfferForm        │
                     ├──────────────────────┤
                     │ Common Fields        │
                     │ Type-specific Fields │
                     │ Validation           │
                     │ Actions              │
                     └──────────┬───────────┘
                                │
                                ▼
                     ┌──────────────────────┐
                     │ Offer Service/Action │
                     └──────────┬───────────┘
                                │
                                ▼
                     ┌──────────────────────┐
                     │       Prisma         │
                     └──────────┬───────────┘
                                │
                                ▼
                     ┌──────────────────────┐
                     │ Existing Shopify /   │
                     │ Page Generation      │
                     └──────────────────────┘
```

Future architecture can extend this with:

```text
AI Offer Generator
AI Recommendation Engine
Experiments
Offer Versions
Autopilot
```

without creating a separate form architecture for each feature.

---

# 13. Agent Instruction — How To Continue After Context Loss

If the coding session is restarted or another agent takes over:

1. Read this entire file.
2. Find the first task with status `IN_PROGRESS`.
3. If none exists, find the first task with status `NOT_STARTED`.
4. Read all previous task completion notes.
5. Inspect the actual code before continuing.
6. Never assume a previous task was completed without checking its notes and code.
7. Continue only from the current task.
8. Update this file when done.

Never restart the whole refactor from the beginning unless explicitly instructed.

---

# 14. Completion Rule

The refactor is complete only when:

```text
TASK 1  = COMPLETE
TASK 2  = COMPLETE
TASK 3  = COMPLETE
TASK 4  = COMPLETE or SKIPPED
TASK 5  = COMPLETE
TASK 6  = COMPLETE
TASK 7  = COMPLETE
TASK 8  = COMPLETE
TASK 9  = COMPLETE
TASK 10 = COMPLETE
TASK 11 = COMPLETE
TASK 12 = COMPLETE
TASK 13 = COMPLETE
TASK 14 = COMPLETE
TASK 15 = COMPLETE
TASK 16 = COMPLETE
```

and the final regression checks pass.

---

# 15. Final Status

```text
Project Status: NOT_STARTED
Current Task: TASK 1
Completed Tasks: 0 / 16
Blocked Tasks: 0
Last Updated: TBD
```
