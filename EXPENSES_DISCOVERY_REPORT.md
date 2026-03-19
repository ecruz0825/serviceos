# Expenses Reporting Implementation - Discovery Report

**Date:** 2025-02-01  
**Task:** Map current Expenses reporting implementation and schema usage

---

## 1. Expense-Related UI Files

### Main Page
- **`src/pages/admin/ExpensesAdmin.jsx`** (175 lines)
  - Main expenses administration page
  - Handles expense CRUD operations (Create, Read, Delete)
  - Displays expense list in a table format
  - Contains inline form for adding expenses
  - **Note:** References `toast.error()` on line 27 but does not import toast (potential bug)

### Components Used
- **`src/components/ui/Button.jsx`**
  - Reusable button component
  - Used for "Add Expense" (variant: "primary") and "Delete" (variant: "danger")

### Layout Wrapper
- **`src/layouts/AppShell.jsx`**
  - Wraps the ExpensesAdmin page
  - Provides sidebar and topbar navigation
  - Sets page title to "Expenses"

### Related Reporting Page
- **`src/pages/admin/ReportsAdmin.jsx`** (98 lines)
  - Displays business summary including total expenses
  - Fetches expenses for aggregate calculations (total expenses, net profit)
  - Shows expenses as part of income/expense/profit summary cards

### Navigation
- **`src/components/nav/navConfig.js`**
  - Defines navigation item for Expenses (path: "/admin/expenses", icon: "dollar-sign")
- **`src/Navbar.jsx`**
  - Contains link to expenses in admin dropdown menu (line 100)

### Charts/Reporting Helpers
- **NONE** - No charting libraries or visualization components found for expenses

### Export Functionality
- **NONE** - No CSV/PDF export functionality found for expenses

---

## 2. Routing Paths

### Primary Route
- **Path:** `/admin/expenses`
- **Component:** `ExpensesAdmin`
- **Route Definition:** `src/App.jsx` (lines 67-76)
- **Protection:** ProtectedRoute with `allowedRoles={['admin']}`
- **Layout:** Wrapped in `AdminShell` with title "Expenses"

### Navigation Access
- **Sidebar:** Available via `navConfig.js` for admin role
- **Top Navbar:** Available in admin dropdown menu

---

## 3. Supabase Queries/RPCs

### Direct Queries (No RPCs Found)

#### 1. Fetch All Expenses
**Location:** `ExpensesAdmin.jsx` - `fetchExpenses()` function (lines 12-23)
```javascript
supabase
  .from('expenses')
  .select('*')
  .order('date', { ascending: false })
```
- **Table:** `expenses`
- **Select:** All columns (`*`)
- **Filters:** None (fetches all expenses, no company_id filter in this query)
- **Ordering:** `date` descending (newest first)
- **Pagination:** None

**ISSUE IDENTIFIED:** This query does NOT filter by `company_id`, meaning it may return expenses from all companies. However, the `addExpense` function does include `company_id` when inserting.

#### 2. Insert Expense
**Location:** `ExpensesAdmin.jsx` - `addExpense()` function (lines 25-79)
```javascript
// Step 1: Get current user
supabase.auth.getUser()

// Step 2: Get company_id from profile
supabase
  .from('profiles')
  .select('company_id')
  .eq('id', user.id)
  .single()

// Step 3: Insert expense
supabase
  .from('expenses')
  .insert([{
    amount: parseFloat(amount),
    category,
    note,
    company_id
  }])
```
- **Table:** `expenses`
- **Fields Inserted:** `amount`, `category`, `note`, `company_id`
- **Note:** Date field is NOT explicitly set in insert (likely uses database default)

#### 3. Delete Expense
**Location:** `ExpensesAdmin.jsx` - `deleteExpense()` function (lines 81-88)
```javascript
supabase
  .from('expenses')
  .delete()
  .eq('id', id)
```
- **Table:** `expenses`
- **Filter:** `id` equals provided expense ID
- **No company_id check:** Delete does not verify company_id ownership

#### 4. Fetch Expenses for Reports (Aggregate)
**Location:** `ReportsAdmin.jsx` - `fetchReportData()` function (lines 43-46)
```javascript
supabase
  .from('expenses')
  .select('amount')
  .eq('company_id', company_id)
```
- **Table:** `expenses`
- **Select:** Only `amount` field
- **Filter:** `company_id` equals user's company
- **Purpose:** Calculate total expenses for business summary

### RPCs/Stored Procedures
- **NONE** - All expense operations use direct Supabase client queries

---

## 4. Current Features

### ✅ Implemented Features

#### Add Expense
- **Form Fields:**
  - Amount (number input, required)
  - Category (text input, required)
  - Note (text input, optional)
- **Validation:** Client-side check for amount and category (line 26-29)
- **Company Isolation:** Automatically associates expense with user's company_id
- **Date Handling:** Not set explicitly in form; likely uses database default

#### View Expenses
- **Display Format:** Table with columns:
  - Date
  - Amount (formatted as currency: `$X.XX`)
  - Category
  - Note
  - Action (Delete button)
- **Sorting:** Ordered by date descending (newest first)
- **Empty State:** Shows "No expenses recorded." message

#### Delete Expense
- **Action:** Delete button per row
- **Confirmation:** None (immediate deletion)
- **No Edit:** Edit functionality is NOT implemented

### ❌ Missing Features

#### Filters
- **NONE** - No date range filters
- **NONE** - No category filter
- **NONE** - No search functionality
- **NONE** - No company_id filter (though fetchExpenses should probably filter by company_id)

#### Summary Totals
- **NONE** - No total amount displayed on ExpensesAdmin page
- **NONE** - No category breakdown
- **NONE** - No date range summaries
- **Note:** ReportsAdmin page shows total expenses, but not on the Expenses page itself

#### Charts
- **NONE** - No visualizations
- **NONE** - No charts/graphs for expense trends
- **NONE** - No category distribution charts

#### Export
- **NONE** - No CSV export
- **NONE** - No PDF export
- **NONE** - No print functionality

#### Edit Expense
- **NONE** - Only add and delete are available
- **Workaround:** Users must delete and re-add to modify

#### Receipt Upload
- **NONE** - No file upload functionality
- **NONE** - No receipt image storage
- **NONE** - No receipt URL field in schema (based on queries)

#### Additional Missing
- **NONE** - No vendor/payee field
- **NONE** - No payment method field
- **NONE** - No job association (expenses not linked to jobs)
- **NONE** - No recurring expense support

---

## 5. Schema Introspection SQL

Run these queries in Supabase SQL Editor to inspect the expenses table and related tables:

### Primary Table: expenses
```sql
-- Get all columns, types, constraints, and defaults for expenses table
SELECT 
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default,
    numeric_precision,
    numeric_scale
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'expenses'
ORDER BY ordinal_position;
```

### Check for Foreign Keys
```sql
-- Find foreign key relationships for expenses table
SELECT
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name = 'expenses';
```

### Check for Indexes
```sql
-- Find indexes on expenses table
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
    AND tablename = 'expenses';
```

### Check RLS Policies
```sql
-- Find Row Level Security policies for expenses table
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'expenses';
```

### Check for Related Tables (if they exist)
```sql
-- Check if expense_categories table exists
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'expense_categories'
);

-- Check if expense_vendors table exists
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'expense_vendors'
);

-- Check if expense_receipts table exists
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'expense_receipts'
);

-- Check if jobs table has expense-related columns
SELECT 
    column_name,
    data_type
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'jobs'
  AND column_name LIKE '%expense%';
```

### Get Table Constraints
```sql
-- Get all constraints (primary keys, unique, checks) for expenses
SELECT
    con.conname AS constraint_name,
    con.contype AS constraint_type,
    pg_get_constraintdef(con.oid) AS constraint_definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public'
    AND rel.relname = 'expenses';
```

### Sample Data Structure Query
```sql
-- Get a sample row to see actual data structure (if table has data)
SELECT *
FROM expenses
LIMIT 1;
```

---

## 6. Query Shape Summary

### Current Query Patterns

1. **List All Expenses** (ExpensesAdmin)
   - `SELECT * FROM expenses ORDER BY date DESC`
   - **Issue:** No company_id filter

2. **Insert Expense** (ExpensesAdmin)
   - `INSERT INTO expenses (amount, category, note, company_id) VALUES (...)`
   - **Note:** Date field not explicitly set

3. **Delete Expense** (ExpensesAdmin)
   - `DELETE FROM expenses WHERE id = ?`
   - **Issue:** No company_id ownership verification

4. **Aggregate Expenses** (ReportsAdmin)
   - `SELECT amount FROM expenses WHERE company_id = ?`
   - **Correct:** Filters by company_id

### Recommended Query Improvements

1. **fetchExpenses should filter by company_id:**
   ```javascript
   supabase
     .from('expenses')
     .select('*')
     .eq('company_id', company_id)
     .order('date', { ascending: false })
   ```

2. **deleteExpense should verify company_id:**
   ```javascript
   supabase
     .from('expenses')
     .delete()
     .eq('id', id)
     .eq('company_id', company_id)
   ```

---

## 7. Dependencies

### External Libraries
- **react-hot-toast** (referenced but not imported in ExpensesAdmin.jsx - bug)
- **@supabase/supabase-js** (via supabaseClient)

### Internal Dependencies
- `src/supabaseClient.js` - Supabase client instance
- `src/components/ui/Button.jsx` - Button component
- `src/layouts/AppShell.jsx` - Layout wrapper
- `src/context/UserContext.jsx` - User context (via ProtectedRoute)

---

## 8. Issues Identified

1. **Missing toast import** - Line 27 uses `toast.error()` but toast is not imported
2. **No company_id filter in fetchExpenses** - May return expenses from all companies
3. **No company_id check in deleteExpense** - Security risk
4. **No date field in insert** - Relies on database default (may be NULL if no default)
5. **No edit functionality** - Users cannot modify existing expenses
6. **No filters** - Cannot filter by date, category, or search
7. **No totals/summaries** - No aggregate information on the expenses page
8. **No export** - Cannot export expense data

---

## 9. File Structure Summary

```
src/
├── pages/
│   └── admin/
│       ├── ExpensesAdmin.jsx      [MAIN PAGE - 175 lines]
│       └── ReportsAdmin.jsx        [USES expenses for totals]
├── components/
│   └── ui/
│       └── Button.jsx              [Used by ExpensesAdmin]
├── layouts/
│   └── AppShell.jsx                [Wraps ExpensesAdmin]
├── components/
│   └── nav/
│       └── navConfig.js            [Navigation config]
└── Navbar.jsx                      [Top nav with expenses link]
```

---

## 10. Next Steps for Enhancement

Based on this discovery, potential enhancements could include:
1. Add company_id filtering to all queries
2. Add date range filters
3. Add category filter/dropdown
4. Add search functionality
5. Add summary totals (total amount, by category, by date range)
6. Add edit expense functionality
7. Add CSV/PDF export
8. Add receipt upload capability
9. Add charts/visualizations
10. Add vendor/payee field
11. Link expenses to jobs (if applicable)
12. Add recurring expense support

---

**End of Report**

