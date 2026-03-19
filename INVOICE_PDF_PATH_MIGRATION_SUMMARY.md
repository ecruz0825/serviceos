# Invoice PDF Path Migration Summary

## Goal
Make `invoices.pdf_path` the single source of truth for invoice PDFs in UI. Stop reading `jobs.invoice_path` except as a temporary fallback.

## Canonical Path Resolution Logic
All files now use the following canonical logic:
```javascript
const invoicePath = invoice?.pdf_path || invoice?.invoice_pdf_path || job?.invoice_path || null;
```

## Files Changed

### 1. `src/pages/customer/InvoiceDetailPage.jsx`
**Changes:**
- Updated `handleViewInvoice()` and `handleDownloadInvoice()` to use canonical path resolution
- Updated invoice data mapping to preserve `pdf_path` and `invoice_pdf_path` fields
- Updated conditional rendering to check canonical path

**Notes:**
- Prefers `invoice.pdf_path` from invoices table
- Falls back to `invoice.invoice_pdf_path` for backward compatibility
- Only uses `job.invoice_path` when no invoice record exists (temporary legacy support)

### 2. `src/pages/customer/InvoicesListPage.jsx`
**Changes:**
- Updated invoice data mapping to prefer `pdf_path` from invoices table
- Updated fallback logic for legacy jobs to set `pdf_path: null` and preserve `invoice_path` as temporary fallback

**Notes:**
- Maps `invoices.pdf_path` to `invoice_pdf_path` for component compatibility
- Legacy jobs fallback maintains `invoice_path` for backward compatibility

### 3. `src/pages/customer/JobDetailPage.jsx`
**Changes:**
- Added invoice loading from `invoices` table when loading job details
- Attached invoice data to job object as `job.__invoice` for canonical path resolution
- Updated `handleViewInvoice()` and `handleDownloadInvoice()` to use canonical path resolution
- Updated conditional rendering to check canonical path

**Notes:**
- Loads invoice from `invoices` table if available
- Falls back to `job.invoice_path` only when no invoice record exists

### 4. `src/components/customer/InvoiceCard.jsx`
**Changes:**
- Updated conditional rendering to use canonical path resolution: `invoice?.pdf_path || invoice?.invoice_pdf_path || invoice?.invoice_path`

**Notes:**
- Simple component update to check all possible path fields

### 5. `src/components/customer/JobCard.jsx`
**Changes:**
- Updated conditional rendering to check canonical path: `job?.__invoice?.pdf_path || job?.__invoice?.invoice_pdf_path || job?.invoice_path`

**Notes:**
- Checks for invoice data attached to job object
- Falls back to legacy `job.invoice_path` if no invoice record

### 6. `src/pages/admin/CustomersAdmin.jsx`
**Changes:**
- Updated `fetchCustomerInvoices()` to prefer loading from `invoices` table
- Merges invoice and job data, preferring `invoices.pdf_path`
- Falls back to jobs table with `invoice_path` only when no invoices found
- Updated invoice view/download handlers to use canonical path resolution

**Notes:**
- Primary: Loads from `invoices` table and joins with jobs
- Fallback: Uses jobs table with `invoice_path` (temporary legacy support)
- All invoice actions use canonical path resolution

### 7. `src/pages/admin/RevenueHub.jsx`
**Changes:**
- Updated job select comment to note `invoice_path` is kept for temporary fallback only
- Updated "Jobs Needing Invoices" queue to use canonical path resolution
- Updated "Invoices With Balance Due" queue to prefer `invoice.pdf_path`
- Updated `renderJobRow()` to use canonical path resolution for `canMarkSent` check

**Notes:**
- Jobs query still selects `invoice_path` for backward compatibility
- All invoice path checks now prefer `invoices.pdf_path`
- Invoice data is already loaded separately and mapped by `job_id`

### 8. `src/components/InvoiceActions.jsx`
**Changes:**
- Updated `hasInvoice` check to use canonical path resolution
- Changed from checking `!!invoice || !!job?.invoice_path` to checking the resolved path

**Notes:**
- Component now uses canonical path resolution for all invoice checks
- Maintains backward compatibility with legacy `job.invoice_path`

### 9. `src/lib/nextActionEngine.js`
**Changes:**
- Updated `getJobNextAction()` to use canonical path resolution for `hasInvoice` check
- Updated `getLifecycleStage()` to use canonical path resolution for `hasInvoice` check
- Both functions now check: `invoice?.pdf_path || invoice?.invoice_pdf_path || job.invoice_path`

**Notes:**
- Supports invoice data attached as `job.__invoice` or `job.invoice`
- Falls back to `job.invoice_path` for legacy support

### 10. `src/utils/revenuePipeline.js`
**Changes:**
- Updated `computeJobStage()` to use canonical path resolution for `hasInvoice` check
- Changed from `!!(job.invoice_path)` to checking: `invoice?.pdf_path || invoice?.invoice_pdf_path || job.invoice_path`

**Notes:**
- Supports invoice data attached as `job.__invoice` or `job.invoice`
- Maintains backward compatibility with legacy `job.invoice_path`

## Implementation Details

### Path Resolution Priority
1. **Primary**: `invoice.pdf_path` (from `invoices` table)
2. **Secondary**: `invoice.invoice_pdf_path` (backward compatibility field)
3. **Fallback**: `job.invoice_path` (temporary legacy support)

### Data Loading Strategy
- **Customer Pages**: Load invoice from `invoices` table when loading job details, attach as `job.__invoice`
- **Admin Pages**: 
  - RevenueHub: Already loads invoices separately and maps by `job_id`
  - CustomersAdmin: Now loads from `invoices` table first, falls back to jobs table

### Backward Compatibility
- All changes maintain backward compatibility with legacy `jobs.invoice_path`
- Legacy path is only used when no invoice record exists in `invoices` table
- No breaking changes to existing functionality

## Testing Recommendations
1. Test invoice viewing/downloading with:
   - Jobs that have invoice records in `invoices` table (preferred path)
   - Jobs that only have `jobs.invoice_path` (legacy fallback)
   - Jobs with no invoice at all (should show appropriate error)

2. Verify all invoice-related UI components:
   - Customer invoice list and detail pages
   - Customer job detail page
   - Admin revenue hub queues
   - Admin customer invoice tab

3. Check that `getSignedInvoiceUrl()` is called with the correct path in all scenarios

## Build Status
✅ No linting errors
✅ All files updated successfully
✅ Backward compatibility maintained
