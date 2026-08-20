# Task: Refactor Shopify Offer Management Into a Unified Dynamic Offer Form

## Objective

Refactor the existing Shopify app offer management implementation so that all offer creation/editing flows use **one unified offer form** instead of separate route files and duplicated form implementations.

The current implementation has offer-related routes/files such as:

```text
app.offers.tsx
app.offers_.new.tsx
app.offers_.new-post.tsx
```

The new implementation must provide a single offer-management architecture where the **offer type** determines the type-specific fields and behavior.

The goal is:

```text
Offers List
    ↓
Create Offer
    ↓
Select Offer Type
    ↓
Unified Offer Form
    ↓
Save Offer
```

and:

```text
Existing Offer
    ↓
Edit
    ↓
Unified Offer Form
    ↓
Detect Offer Type
    ↓
Render appropriate fields
```

Do NOT create a separate full form/route for every new offer type.

---

# 1. Inspect Before Changing Anything

Before implementing:

- Inspect all existing offer routes.
- Inspect all offer forms/components.
- Inspect loaders/actions/API endpoints.
- Inspect Prisma/database models.
- Inspect offer creation/update logic.
- Inspect offer page-generation logic.
- Inspect validation.
- Inspect Shopify integration.
- Inspect navigation links to offer routes.
- Search the project for all references to:

```text
offer
offers
offerType
new-post
```

Understand the current implementation before modifying it.

Do not assume the existing architecture.

Reuse existing components, utilities, validation, API patterns, and Shopify integration wherever possible.

---

# 2. Target Architecture

Implement the offer system around a centralized `offerType`.

Conceptually:

```text
Offer
├── id
├── type
├── title
├── status
├── startDate
├── endDate
├── ...
└── type-specific configuration
```

The UI should use:

```tsx
<OfferForm
  offerType={offerType}
  initialData={offer}
/>
```

The form should contain:

```text
OfferForm
│
├── Common Offer Fields
│
├── Dynamic Type Fields
│
└── Offer Actions
```

Type-specific fields may be separated into small components if necessary:

```text
OfferForm
├── CommonOfferFields
├── PostOfferFields
├── ProductOfferFields
├── CollectionOfferFields
└── OfferActions
```

This is acceptable.

The requirement is **one unified form flow**, not necessarily one giant React file.

---

# 3. Centralize Offer Types

Create or reuse a centralized offer type definition.

For example:

```ts
enum OfferType {
  POST = "post",
  PRODUCT = "product",
  COLLECTION = "collection",
}
```

Use the actual types already supported by the current application.

Do not invent new types without inspecting the existing implementation.

All frontend/backend code should use this centralized definition rather than hardcoded strings.

Avoid code such as:

```ts
if (type === "post")
```

scattered throughout unrelated files.

Centralize type-specific configuration where practical.

---

# 4. Dynamic Offer Configuration

Create a centralized configuration describing each offer type.

Conceptually:

```ts
const offerTypeConfig = {
  post: {
    label: "Post",
    fields: [...],
  },

  product: {
    label: "Product",
    fields: [...],
  },

  collection: {
    label: "Collection",
    fields: [...],
  },
};
```

Use the existing project's architecture and naming conventions.

The configuration should eventually allow additional offer types to be added without creating another complete route/form.

---

# 5. Common Fields

Identify fields shared by all existing offer types.

Typical examples may include:

```text
Title
Description
Image
Status
Start Date
End Date
Placement
```

Do not assume these are all currently required.

Inspect the existing implementation and preserve the current behavior.

Render shared fields through reusable components.

---

# 6. Type-Specific Fields

Only render fields relevant to the selected offer type.

For example:

```text
Post Offer
----------------
Common fields
+
Post-specific fields
```

while:

```text
Product Offer
----------------
Common fields
+
Product-specific fields
```

The user should not have to navigate to a completely different page to create a different offer type.

---

# 7. Single Create Flow

Create one unified creation route following the project's existing Remix routing convention.

Prefer a structure equivalent to:

```text
/offers/new
```

The offer type can be supplied using the existing application's preferred mechanism.

For example:

```text
/offers/new?type=post
```

or through an initial type-selection screen.

Do not create:

```text
/offers/new-post
/offers/new-product
/offers/new-collection
```

as independent implementations.

If old routes already exist, preserve compatibility through redirects where necessary.

---

# 8. Offer Type Selection

The create flow should support:

```text
Create Offer

Select Offer Type

[ Post ]
[ Product ]
[ Collection ]
```

After selecting a type:

```text
Continue
    ↓
Unified Offer Form
```

Alternatively, if the existing application already determines the type before opening the form, preserve that UX.

Do not unnecessarily redesign the existing UI.

---

# 9. Edit Flow

The same `OfferForm` must support both:

```text
Create
```

and:

```text
Edit
```

For edit:

```tsx
<OfferForm
  offerType={offer.type}
  initialData={offer}
/>
```

The form must:

1. Load the existing offer.
2. Determine its type.
3. Render the correct type-specific fields.
4. Populate existing values.
5. Allow changes.
6. Validate the changes.
7. Submit using the existing update mechanism.

Do not create separate edit forms for each offer type.

---

# 10. Form Mode

The unified form should support:

```ts
mode: "create" | "edit"
```

or the project's equivalent pattern.

Conceptually:

```tsx
<OfferForm
  mode="create"
  offerType={type}
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

Common logic should not be duplicated between create and edit.

---

# 11. Validation

Validation must depend on `offerType`.

Use the existing validation library.

Conceptually:

```ts
getOfferValidationSchema(offerType)
```

For example:

```text
POST
→ validate post fields

PRODUCT
→ validate product fields

COLLECTION
→ validate collection fields
```

Common validation should be shared.

Do not rely only on frontend validation.

Backend validation must also verify the offer type and type-specific fields.

---

# 12. Backend/API

Inspect the existing Remix actions/loaders/API implementation.

Refactor it so that create/update operations use the unified offer payload.

Conceptually:

```json
{
  "type": "post",
  "title": "Example Offer",
  "description": "...",
  "..."
}
```

The backend should determine validation and processing based on:

```text
offer.type
```

Do not create a new backend endpoint for every offer type unless the existing architecture absolutely requires it.

Prefer:

```text
POST /offers
PUT/PATCH /offers/:id
```

or the project's existing equivalent.

---

# 13. Database

Inspect the current Prisma schema before modifying it.

If an offer type field already exists, reuse it.

If it does not exist, add it through a proper Prisma migration.

The database should support multiple offer types without requiring separate tables for every form type unless the current data model genuinely requires that.

Do not destroy or restructure existing production data unnecessarily.

Existing offers must remain usable.

---

# 14. Existing Offer Data

This is critical.

Before changing the offer model:

- Identify all existing offer records.
- Determine their current type.
- Ensure each existing record can be mapped to the new `offerType`.
- Preserve all existing values.
- Verify old offers can still be edited.

Do not create a migration that causes existing offers to become unusable.

If existing offers do not have an explicit type, determine how the current implementation identifies their type and migrate that information safely.

---

# 15. Offer List

Keep one offer list.

The existing:

```text
app.offers.tsx
```

should remain the main offer listing page unless the current project architecture requires a different route.

The list should show all offer types.

Where useful, show:

```text
Offer
Type
Status
Placement
Start Date
End Date
Performance
Actions
```

Do not create separate offer lists per type.

---

# 16. Page Generation

The current application generates offer-related pages.

Inspect the existing page-generation implementation.

The refactor must NOT break page generation.

If page generation currently depends on the offer type:

```text
offer.type
```

must continue to be available to that system.

Do not rewrite the page-generation architecture unless necessary.

The unified form should save the data required by the existing page generator.

---

# 17. Future Compatibility With Offer Engine

The broader product architecture is intended to eventually support:

```text
Manual Offers
AI Generated Offers
Discount Offers
Bundle Offers
Free Gift
Dynamic Offers
```

Therefore, design the unified offer model so that adding another offer type later does not require another completely independent route/form implementation.

Do not implement the complete AI engine in this task.

Only ensure the current offer architecture does not block future AI-generated/dynamic offers.

---

# 18. Future Offer Lifecycle

The broader architecture also expects offer lifecycle states such as:

```text
DRAFT
SCHEDULED
ACTIVE
PAUSED
EXPIRED
ARCHIVED
```

and eventually offer versions.

Inspect whether the existing application already has these concepts.

Do not implement unrelated lifecycle/versioning functionality unless it already exists or is required by the current offer system.

However, do not design the new form in a way that prevents these fields from being added later.

---

# 19. Remove Duplicated Routes

After the unified flow is working, determine whether these files are still required:

```text
app.offers_.new.tsx
app.offers_.new-post.tsx
```

If their functionality has been fully replaced:

- Remove duplicated implementations.
- Remove unused imports.
- Remove obsolete actions/loaders.
- Remove obsolete components only if they are not used elsewhere.

Do NOT blindly delete them.

Search the entire project first.

---

# 20. Backward Compatibility

If existing URLs are already used, preserve them.

For example:

```text
/offers/new-post
```

can redirect to:

```text
/offers/new?type=post
```

Do the same for any other old offer creation routes.

Existing bookmarks and internal links should not unexpectedly return 404.

---

# 21. Shopify Integration

Do not change unrelated Shopify behavior.

Preserve:

- Shopify authentication.
- Store identification.
- Shopify API access.
- Product selection.
- Collection selection.
- Offer publishing.
- Offer page generation.
- Existing Shopify metafield behavior.
- Existing store-specific behavior.

Only refactor the offer-management architecture.

---

# 22. UI Requirements

Use the existing Shopify Polaris components/design system.

Do not introduce another UI framework.

The form should feel like one application.

Example:

```text
Create Offer
────────────────────────

Offer Type
[ Product ▼ ]

Basic Information
────────────────────────
Title
Description
Image

Product Offer
────────────────────────
Product
Discount
Quantity

Schedule
────────────────────────
Start Date
End Date

Placement
────────────────────────
...

[ Cancel ] [ Save Offer ]
```

When the offer type changes, only the type-specific fields should change.

Do not duplicate the entire form.

---

# 23. Loading / Error / Success States

The unified form must handle:

- Initial loading.
- Existing offer loading.
- Product/collection loading.
- Form submission.
- Validation errors.
- Shopify API errors.
- Backend errors.
- Successful creation.
- Successful update.

Reuse existing project patterns for:

- Toasts.
- Banners.
- Loading indicators.
- Error handling.

Do not introduce duplicate notification systems.

---

# 24. Testing

Test every existing offer type.

For each type test:

### Create

```text
Select type
→ Fill form
→ Save
→ Verify database record
```

### Edit

```text
Open offer
→ Correct type detected
→ Correct fields displayed
→ Existing values populated
→ Save
```

### Validation

Verify required fields and invalid values.

### Existing Offers

Verify old offers continue to work.

### Page Generation

Verify existing offer page generation still works.

### Routes

Verify old routes redirect correctly if they are retained for compatibility.

---

# 25. Code Quality

Avoid:

- Duplicated forms.
- Duplicated validation.
- Duplicated API actions.
- Hardcoded offer types throughout the codebase.
- Unnecessary abstractions.
- Unrelated refactoring.

Prefer:

```text
Central Offer Type
        ↓
Offer Configuration
        ↓
Unified OfferForm
        ↓
Shared Validation
        ↓
Unified Create/Update Action
```

---

# 26. Final Project Structure

The exact structure should follow the existing application, but conceptually aim for:

```text
offers/
├── list
├── new
├── edit
│
├── components/
│   ├── OfferForm
│   ├── CommonOfferFields
│   ├── OfferTypeSelector
│   └── type-specific fields
│
├── config/
│   └── offerTypes
│
├── validation/
│   └── offerSchemas
│
└── services/
    └── offerService
```

Do not force this exact folder structure if the project already has an established Remix structure.

---

# 27. Important Rule

Do NOT simply rename:

```text
app.offers_.new-post.tsx
```

into another file and call the task complete.

The actual requirement is to remove the architectural duplication.

The final implementation should make it possible to add a new offer type with minimal changes:

```text
Add offer type definition
+
Add type-specific configuration/fields
+
Add validation
```

without creating:

```text
new route
new complete form
new duplicated action
new duplicated page
```

---

# 28. Final Verification

Before completing the task:

- Inspect all existing offer routes.
- Implement unified form.
- Implement centralized offer type.
- Preserve existing offer behavior.
- Preserve existing page generation.
- Preserve Shopify integration.
- Verify create.
- Verify edit.
- Verify all existing offer types.
- Verify existing database records.
- Verify old routes.
- Remove duplicate code where safe.
- Run lint.
- Run TypeScript checks.
- Run tests.
- Fix any regressions.

## Final Response From Coding Agent

After implementation, report:

1. What was changed.
2. New unified offer architecture.
3. Supported offer types.
4. Files created.
5. Files modified.
6. Files removed.
7. Routes changed.
8. Database/migration changes.
9. API/action changes.
10. Backward compatibility changes.
11. Tests executed.
12. Any assumptions or remaining issues.