# Next Step Hints - Track 3 Step 2

## Summary

Added small, non-intrusive "Next step" hints for Quotes, Jobs, and Invoices based ONLY on existing statuses. No new business rules, no backend changes.

---

## Files Created

### 1. `src/lib/nextStepHints.js`

**Purpose:** Centralized helper functions for next step guidance

**Functions:**
- `getQuoteNextStep(quote)` - Returns next step hint for quotes
- `getJobNextStep(job)` - Returns next step hint for jobs
- `getInvoiceNextStep(invoice, options)` - Returns next step hint for invoices

**Logic:**
- All functions read ONLY existing fields (status, converted_job_id, service_date, invoice_path, etc.)
- No RPC calls, no new database fields
- Fallback to "Next: Review details" if data is missing or unclear
- Terminal states return "No further actions"

---

## Files Modified

### 1. `src/pages/admin/QuotesAdmin.jsx`

**Changes:**
- Added import: `getQuoteNextStep` from `nextStepHints`
- Added next step hint below status badge in table rows

**Location:** Lines ~800-804 (Status column)

**UI Placement:**
- Small text (`text-xs text-slate-500`) below status badge
- Non-intrusive, muted styling

**Status Mappings:**
- `draft` → "Next: Send quote to customer"
- `sent` → "Next: Await customer response"
- `accepted` (no job) → "Next: Convert to job"
- `accepted` (has job) → "Next: Work the job"
- `rejected` / `expired` → "No further actions"

---

### 2. `src/pages/admin/QuoteBuilder.jsx`

**Changes:**
- Added import: `getQuoteNextStep` from `nextStepHints`
- Added next step hint in status display card (view mode only)

**Location:** Lines ~637-642 (Status display section)

**UI Placement:**
- Small text below status badge in the status card
- Only shown in view mode (read-only)

**Status Mappings:** Same as QuotesAdmin.jsx

---

### 3. `src/components/jobs/JobCard.jsx`

**Changes:**
- Added import: `getJobNextStep` from `nextStepHints`
- Added next step hint next to status badge

**Location:** Lines ~80-84 (Status badge area)

**UI Placement:**
- Small text (`text-xs text-slate-500`) below status badge
- Right-aligned to match status badge position

**Status Mappings:**
- `pending` (no service_date) → "Next: Schedule job"
- Has service_date (not completed) → "Next: Complete job"
- `completed` (no invoice) → "Next: Create invoice"
- `completed` (has invoice, draft) → "Next: Send invoice"
- `completed` (has invoice, sent/overdue) → "Next: Record payment"
- `completed` (has invoice, paid) → "No further actions"
- `canceled` / `cancelled` → "No further actions"

---

### 4. `src/pages/admin/RevenueHub.jsx`

**Changes:**
- Added import: `getInvoiceNextStep` from `nextStepHints`
- Added next step hint for invoices in jobs list

**Location:** Lines ~1511-1546 (Invoice status display)

**UI Placement:**
- Small text below invoice status badge
- Only shown when invoice exists

**Status Mappings:**
- `draft` → "Next: Send invoice"
- `sent` (unpaid) → "Next: Record payment"
- `sent` (overdue) → "Next: Follow up for payment"
- `overdue` → "Next: Follow up for payment"
- `paid` → "No further actions"
- `void` / `voided` → "No further actions"

**Note:** Uses invoice data from `invoicesByJobId` and payment totals from `paymentsByJob` to calculate balance for accurate hints.

---

### 5. `src/pages/admin/CustomersAdmin.jsx`

**Changes:**
- Added import: `getInvoiceNextStep` from `nextStepHints`
- Added next step hint for invoices in customer drawer

**Location:** Lines ~2727-2750 (Invoice status column in table)

**UI Placement:**
- Small text below invoice status badge in table
- Only shown in invoice list within customer drawer

**Status Mappings:** Same as RevenueHub.jsx

**Note:** Uses job status as fallback if invoice_status not available (for backward compatibility).

---

## Status Enum Mappings

### Quotes
Based on `PIPELINE_MAP.md`:
- `draft` → "Next: Send quote to customer"
- `sent` → "Next: Await customer response"
- `accepted` (no `converted_job_id`) → "Next: Convert to job"
- `accepted` (has `converted_job_id`) → "Next: Work the job"
- `rejected` → "No further actions"
- `expired` → "No further actions"

### Jobs
Based on `PIPELINE_MAP.md`:
- `Pending` (no `service_date`) → "Next: Schedule job"
- Has `service_date` (not `Completed`) → "Next: Complete job"
- `Completed` (no invoice) → "Next: Create invoice"
- `Completed` (has invoice, `draft`) → "Next: Send invoice"
- `Completed` (has invoice, `sent`/`overdue`) → "Next: Record payment"
- `Completed` (has invoice, `paid`) → "No further actions"
- `Canceled` / `Cancelled` → "No further actions"

### Invoices
Based on `PIPELINE_MAP.md`:
- `draft` → "Next: Send invoice"
- `sent` (balance > 0, not overdue) → "Next: Record payment"
- `sent` (balance > 0, overdue) → "Next: Follow up for payment"
- `overdue` → "Next: Follow up for payment"
- `paid` → "No further actions"
- `void` / `voided` → "No further actions"

---

## Implementation Details

### Helper Functions Logic

**`getQuoteNextStep(quote)`:**
- Checks `quote.status` (lowercased for comparison)
- Checks `quote.converted_job_id` for job existence
- Returns appropriate hint based on status and job presence

**`getJobNextStep(job)`:**
- Checks `job.status` (lowercased for comparison)
- Checks `job.service_date` for scheduling
- Checks `job.completed_at` or `status === 'completed'` for completion
- Checks invoice existence via `job.__invoice`, `job.invoice`, or `job.invoice_path`
- Checks `invoice.status` or `job.invoice_status` for invoice state
- Returns appropriate hint based on job state

**`getInvoiceNextStep(invoice, options)`:**
- Checks `invoice.status` (lowercased for comparison)
- Uses `options.totalPaid` to calculate balance
- Checks `invoice.due_date` for overdue detection
- Returns appropriate hint based on invoice state and balance

### UI Styling

All hints use consistent styling:
- `text-xs` - Small text size
- `text-slate-500` - Muted color
- Placed below or next to status badges
- Non-intrusive, guidance-only appearance

### Data Sources

All hints read ONLY existing fields:
- Quote: `status`, `converted_job_id`
- Job: `status`, `service_date`, `completed_at`, `invoice_path`, `invoice_status`, `invoice_id`
- Invoice: `status`, `total`, `due_date` (from invoices table or job)

No new fields, RPCs, or business logic added.

---

## Testing Checklist

- [ ] Quote hints appear in QuotesAdmin table
- [ ] Quote hints appear in QuoteBuilder view mode
- [ ] Job hints appear in JobCard component
- [ ] Invoice hints appear in RevenueHub jobs list
- [ ] Invoice hints appear in CustomersAdmin invoice table
- [ ] Hints update correctly when status changes
- [ ] Terminal states show "No further actions"
- [ ] Fallback shows "Next: Review details" for unclear states
- [ ] Styling is consistent and non-intrusive

---

## Deliverable Confirmation

### Quotes
- ✅ Helper function: `getQuoteNextStep(quote)`
- ✅ Location: QuotesAdmin.jsx (table), QuoteBuilder.jsx (detail view)
- ✅ Status mappings: draft, sent, accepted, rejected, expired

### Jobs
- ✅ Helper function: `getJobNextStep(job)`
- ✅ Location: JobCard.jsx component
- ✅ Status mappings: pending, scheduled, completed, canceled

### Invoices
- ✅ Helper function: `getInvoiceNextStep(invoice, options)`
- ✅ Location: RevenueHub.jsx (jobs list), CustomersAdmin.jsx (customer drawer)
- ✅ Status mappings: draft, sent, paid, overdue, void

---

**Date:** 2025-01-16
**Status:** Complete
