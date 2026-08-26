# Task 1 — Analyze Existing Offer Architecture

## Objective

Before making any code changes, analyze the existing Shopify app offer implementation.

This is an investigation-only task.

**DO NOT modify, delete, rename, or create application files.**

## Inspect

Find and analyze all offer-related implementation.

Search for:

```text
offers
offer
offerType
new-post
new
edit
```

Specifically inspect files such as:

```text
app.offers.tsx
app.offers_.new.tsx
app.offers_.new-post.tsx
```

Also find:

- Offer components
- Offer forms
- Offer loaders
- Offer actions
- Offer APIs
- Prisma models
- Offer validation
- Shopify API calls
- Offer page generation
- Offer publishing logic
- Offer navigation
- Offer routes
- Offer type definitions

## Determine

Document:

### 1. Current offer types

List every offer type currently supported.

Example:

```text
post
product
collection
```

Do not assume these are the actual types.

### 2. Current routes

Create a table:

| Route/File | Purpose | Offer Type | Create/Edit | Important Dependencies |
|---|---|---|---|---|

### 3. Current forms

Identify:

- Which forms are duplicated?
- Which fields are common?
- Which fields are type-specific?
- Which components can be reused?

### 4. Backend

Identify:

- Create action/API
- Update action/API
- Delete action/API
- Loader/API
- Validation
- Database operations

### 5. Database

Inspect the Prisma schema and identify:

- Offer model
- Related models
- Offer type field
- Offer status
- Offer configuration/data fields
- Relationships

Do not change the schema.

### 6. Page Generation

Explain:

```text
Offer
 ↓
What code generates the offer page?
 ↓
Where is offer type used?
 ↓
How is the generated page stored/published?
```

### 7. Shopify Integration

Identify all Shopify calls related to offers.

### 8. Existing Data

Determine whether existing offers already contain an explicit type.

If not, explain how the current application determines the offer type.

## Required Output

Return a concise architecture report containing:

### Current Architecture

```text
Offer List
   ↓
...
```

### Current Routes

List all relevant routes.

### Current Offer Types

List all types.

### Current Forms

List all forms/components and their responsibilities.

### Current Backend Flow

Explain create/update flow.

### Current Database

Explain the relevant Prisma models.

### Duplication

Clearly identify duplicated code.

### Recommended Refactor

Provide a proposed target architecture:

```text
Offer List
    ↓
Create Offer
    ↓
Offer Type
    ↓
Unified OfferForm
    ↓
Type-specific fields
    ↓
Unified Create/Update
```

### Files That Should Eventually Be Changed

List files, but **do not change them in this task**.

### Risks

Identify anything that could break existing offers, page generation, Shopify integration, or existing URLs.

## Important

Do not implement anything.

Do not refactor anything.

Do not delete anything.

This task is only to understand the existing architecture and prepare the implementation plan for Task 2.