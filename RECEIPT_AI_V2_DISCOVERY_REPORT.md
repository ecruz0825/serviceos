# Receipt AI v2 Discovery Report

**Generated:** 2025-01-XX  
**Repository:** lawncare-app  
**Purpose:** Discovery of Receipt AI v2 implementation details (read-only analysis)

---

## 1. Edge Function Call Sites

### Callsite #1: ExpensesAdmin.jsx

**File:** `src/pages/admin/ExpensesAdmin.jsx`  
**Line:** 605  
**Function:** `handleExtractReceipt(expenseId)`

**Request Body Keys:**
```javascript
{
  expense_id: expenseId  // string, UUID of the expense record
}
```

**Full Context:**
```605:607:src/pages/admin/ExpensesAdmin.jsx
      const { data, error } = await supabase.functions.invoke('extract-expense-receipt', {
        body: { expense_id: expenseId },
      });
```

**Invocation Flow:**
- Triggered when user clicks "Extract" button on an expense with a receipt (line 1092)
- Only enabled when `ENABLE_AI_EXTRACTION = true` (line 11)
- Requires expense to have `receipt_path` set (checked at line 545)

**Total Callsites Found:** 1

---

## 2. Receipt Storage Fields

### Source of Truth: `receipt_path`

**Primary Field:** `receipt_path` (text, nullable)

**End-to-End Flow:**

1. **Upload** (`src/pages/admin/ExpensesAdmin.jsx:398-463`):
   - File uploaded to Supabase Storage bucket: `expense-receipts`
   - Storage path format: `{company_id}/expenses/{expense_id}/{timestamp}_{filename}`
   - Database update: `receipt_path` = storage path, `receipt_uploaded_at` = current timestamp

2. **Database Save** (`src/pages/admin/ExpensesAdmin.jsx:437-444`):
   ```javascript
   .update({
     receipt_path: storagePath,
     receipt_uploaded_at: new Date().toISOString(),
   })
   ```

3. **Edge Function Read** (`supabase/functions/extract-expense-receipt/index.ts:131-135`):
   ```typescript
   .select("id, company_id, receipt_path")
   .eq("id", expense_id)
   ```
   - Edge function validates `receipt_path` exists (line 159)
   - Generates signed URL from `receipt_path` (line 170-172)

4. **Frontend Display** (`src/pages/admin/ExpensesAdmin.jsx:544-573`):
   - Uses `expense.receipt_path` to generate signed URL for viewing
   - Filters expenses by `receipt_path` presence (lines 204, 206)

### Secondary Field: `receipt_uploaded_at`

**Field:** `receipt_uploaded_at` (timestamptz, nullable)
- Stored alongside `receipt_path` but not used in edge function
- Appears to be for audit/tracking purposes only

### Other Fields Checked (Not Used):

The following fields were searched but **NOT found** in the codebase:
- ❌ `receipt_url` - Not used
- ❌ `receipt_image` - Not used  
- ❌ `receipt` - Not used (too generic, would match other contexts)
- ❌ `attachment` - Not used
- ❌ `image_path` - Not used
- ❌ `storage_path` - Not used

### Database Schema

**Table:** `public.expenses`  
**Migration:** `supabase/migrations/20260201133730_harden_expenses_schema.sql`

**Receipt-related columns:**
```sql
receipt_path text NULL,
receipt_uploaded_at timestamptz NULL
```

**Storage Bucket:** `expense-receipts` (private bucket)  
**Storage Policies:** Defined in `supabase/migrations/20260201140000_expense_receipts_bucket_policies.sql`

---

## 3. Category Source

### Source Type: Derived from Expenses (Not a DB Table)

**Location:** `src/pages/admin/ExpensesAdmin.jsx:233-237`

```javascript
const categories = useMemo(() => {
  const cats = [...new Set(expenses.map(exp => exp.category).filter(Boolean))];
  return cats.sort();
}, [expenses]);
```

**Details:**
- Categories are **NOT** stored in a separate `expense_categories` table
- Categories are **NOT** hardcoded constants
- Categories are **NOT** a database enum
- Categories are **derived dynamically** from existing expense records
- The `category` field is a **text column** on the `expenses` table itself
- Categories are extracted from all expenses, deduplicated, and sorted alphabetically
- Used for filtering dropdown (line 887-896)

### Database Schema

**Table:** `public.expenses`  
**Column:** `category` (text, nullable, inferred from usage)

**Index:** 
```sql
CREATE INDEX IF NOT EXISTS expenses_company_category_idx 
  ON public.expenses(company_id, category);
```
(From `supabase/migrations/20260201133730_harden_expenses_schema.sql:52-53`)

**Filtering:**
- Categories are filtered by `company_id` implicitly (all expenses queried are already filtered by company)
- No explicit `expense_categories` table with `company_id` foreign key

### Category Usage in Code

1. **Form Input** (line 811-817): Free-text input field (no dropdown/autocomplete)
2. **Filter Dropdown** (line 887-896): Populated from derived categories list
3. **Database Insert** (line 333): Stored as-is in `category` column
4. **Database Query** (line 190): Filtered by exact match: `exp.category === categoryFilter`

---

## 4. Relevant Migrations

### Migration #1: Harden Expenses Schema

**File:** `supabase/migrations/20260201133730_harden_expenses_schema.sql`  
**Date:** 2026-02-01 13:37:30

**Purpose:** Multi-tenant safety + receipt support

**Key Changes:**
1. Adds `receipt_path` and `receipt_uploaded_at` columns
2. Sets NOT NULL constraints on `company_id`, `date`, `created_at`
3. Adds default values for `date` and `created_at`
4. Creates performance indexes:
   - `expenses_company_date_idx` on `(company_id, date DESC)`
   - `expenses_company_category_idx` on `(company_id, category)`

**Receipt-related columns added:**
```sql
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS receipt_path text NULL,
  ADD COLUMN IF NOT EXISTS receipt_uploaded_at timestamptz NULL;
```

### Migration #2: Expense Receipts Bucket Policies

**File:** `supabase/migrations/20260201140000_expense_receipts_bucket_policies.sql`  
**Date:** 2026-02-01 14:00:00

**Purpose:** Storage access policies for `expense-receipts` bucket

**Key Policies:**
- **SELECT:** Authenticated users can view receipts in their company folder
- **INSERT/UPDATE/DELETE:** Admin-only, same company folder restriction
- Path format enforced: `{company_id}/expenses/{expense_id}/{filename}`

**Note:** Bucket `expense-receipts` must be created manually in Supabase Dashboard as private bucket.

### Other Migrations Referenced

No other migrations directly modify the `expenses` table. The initial `CREATE TABLE expenses` statement is not present in the migrations directory (likely created via Supabase Dashboard or an earlier migration not tracked in this repo).

**Inferred Schema (from migrations and code usage):**
- `id` (uuid, primary key)
- `company_id` (uuid, NOT NULL, foreign key to companies)
- `amount` (numeric)
- `category` (text, nullable)
- `note` (text, nullable)
- `date` (date, NOT NULL, default CURRENT_DATE)
- `created_at` (timestamptz, NOT NULL, default now())
- `receipt_path` (text, nullable) - **receipt storage field**
- `receipt_uploaded_at` (timestamptz, nullable) - **receipt metadata**

---

## Summary

### Edge Function Integration
- **Single callsite** in `ExpensesAdmin.jsx:605`
- Request body: `{ expense_id: string }`
- Edge function reads `receipt_path` from expenses table

### Receipt Storage
- **Primary field:** `receipt_path` (text, nullable)
- **Storage bucket:** `expense-receipts` (private)
- **Path format:** `{company_id}/expenses/{expense_id}/{timestamp}_{filename}`
- **End-to-end flow:** Upload → DB save (`receipt_path`) → Edge function read → Display

### Categories
- **Source:** Derived from existing expenses (not a DB table)
- **Storage:** Text column on `expenses` table
- **Filtering:** By `company_id` (implicit via expense queries)
- **No separate table:** Categories are free-form text values

### Database Schema
- **Receipt fields:** `receipt_path`, `receipt_uploaded_at` (added in migration 20260201133730)
- **Category field:** `category` (text, nullable, indexed with company_id)
- **Key migrations:** 2 files related to expenses/receipts

---

**End of Report**

