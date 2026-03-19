# Pipeline Visibility Changes - Track 3 Step 1

## Summary

Updated admin UI to make Quote → Job → Invoice → Payment pipeline actions **always visible** but **disabled** when not allowed, with clear reasons. No more "hidden until ready".

---

## Files Changed

### 1. `src/pages/admin/QuotesAdmin.jsx`

**Change:** Made "Convert to Job" button always visible but disabled when conditions aren't met.

**Before:**
- Button was conditionally rendered: `{quote.status === 'accepted' && quote.converted_job_id && <Open Job button>}`
- "Convert to Job" action was not visible in the list view

**After:**
- "Convert to Job" button is always visible
- Disabled when:
  - `quote.status !== 'accepted'` → Tooltip: "Quote must be accepted before converting to job"
  - `quote.converted_job_id` exists → Tooltip: "Job already created from this quote"
- "Open Job" button still shown when job exists (different action)

**Location:** Lines ~915-942

---

### 2. `src/pages/admin/QuoteBuilder.jsx`

**Change:** Enhanced "Convert to Job" button disabled state with better conditions and tooltips.

**Before:**
- Button was always visible but only checked `!id` for disabled state
- Tooltip only showed "Save quote first"

**After:**
- Button always visible
- Disabled when:
  - `!id` → Tooltip: "Save quote first"
  - `quoteMetadata.status !== 'accepted'` → Tooltip: "Quote must be accepted before converting to job"
  - `converting` → Shows "Converting..." text
- Better tooltip messages explaining why it's disabled

**Location:** Lines ~922-938

---

### 3. `src/pages/admin/CustomersAdmin.jsx`

**Change:** Made invoice View and Download buttons always visible but disabled when invoice PDF not available.

**Before:**
- Buttons were always visible but would show error toast when clicked without PDF
- No disabled state indication

**After:**
- Buttons always visible
- Disabled when `!invoice.invoice_path`
- Tooltip: "Invoice PDF not available" when disabled
- Visual disabled state with opacity and cursor changes

**Location:** Lines ~2743-2799 (View and Download buttons)

---

### 4. `src/components/InvoiceActions.jsx`

**Status:** ✅ Already follows the pattern - no changes needed

**Current Behavior:**
- All 4 buttons (Invoice, Email, View, PDF) are always visible
- "Invoice" button disabled when `job.status !== "Completed"` → Tooltip: "Complete job first"
- "Email", "View", "PDF" buttons disabled when `!hasInvoice` → Tooltip: "Generate invoice first"
- Mobile helper text shown below buttons when disabled

---

## Actions Verified

### ✅ Convert Quote to Job
- **QuotesAdmin.jsx:** Always visible, disabled with clear reasons
- **QuoteBuilder.jsx:** Always visible, disabled with clear reasons
- **Status:** Complete

### ✅ Create Invoice
- **JobsAdmin.jsx:** Uses `InvoiceActions` component (already follows pattern)
- **Status:** Already compliant

### ✅ View/Download Invoice
- **InvoiceActions.jsx:** Already follows pattern
- **CustomersAdmin.jsx:** Now always visible, disabled when PDF unavailable
- **Status:** Complete

### ✅ Record Payment
- **JobsAdmin.jsx:** Payment section always visible (no conditional hiding)
- **Status:** Already compliant

---

## UX Improvements

1. **Clear Disabled States:**
   - All disabled buttons use `disabled:opacity-50 disabled:cursor-not-allowed` classes
   - Visual feedback is consistent across all actions

2. **Helpful Tooltips:**
   - Every disabled button has a `title` attribute explaining why it's disabled
   - Tooltips are specific to the condition (e.g., "Quote must be accepted before converting to job")

3. **No Hidden Actions:**
   - Users can now see all available pipeline actions at a glance
   - Clear indication of what's needed to enable each action

---

## Business Logic Preserved

- ✅ No RPCs changed
- ✅ No status enums changed
- ✅ No business rules changed
- ✅ All existing conditions reused as `disabled` expressions
- ✅ Only visibility pattern changed (conditional rendering → always visible with disabled state)

---

## Testing Checklist

- [ ] "Convert to Job" button visible on all quotes in QuotesAdmin
- [ ] "Convert to Job" disabled with tooltip when quote not accepted
- [ ] "Convert to Job" disabled with tooltip when job already created
- [ ] "Convert to Job" enabled when quote is accepted and no job exists
- [ ] "Convert to Job" button in QuoteBuilder shows proper disabled states
- [ ] Invoice View/Download buttons always visible in CustomersAdmin
- [ ] Invoice View/Download buttons disabled when PDF unavailable
- [ ] InvoiceActions component still works correctly (no regressions)
- [ ] All tooltips display correctly on hover

---

**Date:** 2025-01-16
**Status:** Complete
