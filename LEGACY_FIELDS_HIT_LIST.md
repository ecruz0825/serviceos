# Legacy Fields Hit List

## Summary
This document lists all remaining usages of legacy invoice and assignment fields in the codebase.

---

## 1. INVOICE LEGACY: `jobs.invoice_path`

### Source Code Files

#### `src/pages/admin/JobsAdmin.jsx`
- **Line 461**: `if (!job?.invoice_path) {`
- **Line 465**: `return await getSignedInvoiceUrl({ invoice_path: job.invoice_path });`
- **Line 469**: `invoice_path: job.invoice_path,`
- **Line 494**: `invoice_path,`
- **Line 707**: `// Check if invoice_path exists, use signed URL`
- **Line 708**: `if (job.invoice_path) {`
- **Line 730**: `// No invoice_path: show toast`
- **Line 736**: `invoice_path: job.invoice_path,`
- **Line 966**: `// 5) Update job with invoice_path and invoice_uploaded_at (backward compatibility)`
- **Line 967**: `// Keep this for now to maintain compatibility with existing code that checks job.invoice_path`
- **Line 971**: `invoice_path: path,`
- **Line 977**: `console.warn("Failed to update job with invoice_path (non-fatal)", {`
- **Line 979**: `invoice_path: path,`
- **Line 985**: `// Refresh data to get updated invoice_path and invoice row`
- **Line 1009**: `// Get signed URL for the newly generated invoice (use the path from upload, not stale job.invoice_path)`
- **Line 1012**: `signedUrl = await getSignedInvoiceUrl({ invoice_path: path });`
- **Line 1016**: `invoice_path: path,`
- **Line 1073**: `invoice_path: job.invoice_path,`
- **Line 1086**: `if (!job.invoice_path) {`
- **Line 1127**: `invoice_path: job.invoice_path,`
- **Line 1550**: `// Add invoice link if invoice_path exists`
- **Line 1551**: `if (job.invoice_path) {`
- **Line 1560**: `invoice_path: job.invoice_path,`

#### `src/pages/admin/RevenueHub.jsx`
- **Line 92**: `.select('id, customer_id, status, service_date, scheduled_end_date, scheduled_date, job_cost, services_performed, invoice_path, invoice_uploaded_at, completed, completed_at, assigned_team_id, assigned_to, assigned_crew_member_id, assigned_user_id, created_at, updated_at')`
- **Line 440**: `const hasInvoicePath = !!j.invoice_path`
- **Line 497**: `// Fallback: use jobs.invoice_path + computed balanceDue`
- **Line 505**: `// Must have invoice (either from invoices table or jobs.invoice_path)`
- **Line 507**: `const hasInvoicePath = !!j.invoice_path`

#### `src/components/InvoiceActions.jsx`
- **Line 21**: `// Check for invoice from invoice table first, fallback to job.invoice_path for backward compatibility`
- **Line 22**: `const hasInvoice = !!invoice || !!job?.invoice_path;`

#### `src/pages/admin/CustomersAdmin.jsx`
- **Line 427**: `.select('id, service_date, services_performed, status, job_cost, invoice_path')`
- **Line 430**: `.not('invoice_path', 'is', null)`
- **Line 431**: `.neq('invoice_path', '')`
- **Line 2670**: `if (invoice.invoice_path.startsWith('http://') || invoice.invoice_path.startsWith('https://')) {`
- **Line 2671**: `url = invoice.invoice_path;`
- **Line 2673**: `url = await getSignedInvoiceUrl({ invoice_path: invoice.invoice_path, expiresIn: 60 });`
- **Line 2691**: `if (invoice.invoice_path.startsWith('http://') || invoice.invoice_path.startsWith('https://')) {`
- **Line 2692**: `url = invoice.invoice_path;`
- **Line 2694**: `url = await getSignedInvoiceUrl({ invoice_path: invoice.invoice_path, expiresIn: 60 });`

#### `src/pages/customer/InvoicesListPage.jsx`
- **Line 62**: `invoice_path: inv.invoice_pdf_path,`
- **Line 74**: `.select('id, job_cost, invoice_path, invoice_uploaded_at, service_date, status')`
- **Line 76**: `.not('invoice_path', 'is', null)`
- **Line 106**: `invoice_path: job.invoice_path,`
- **Line 107**: `invoice_pdf_path: job.invoice_path,`

#### `src/pages/customer/InvoiceDetailPage.jsx`
- **Line 87**: `invoice_path: jobData.invoice_path,`
- **Line 88**: `invoice_pdf_path: jobData.invoice_path,`
- **Line 133**: `const invoicePath = invoice?.invoice_pdf_path || invoice?.invoice_path`
- **Line 139**: `const signedUrl = await getSignedInvoiceUrl({ invoice_path: invoicePath })`
- **Line 148**: `const invoicePath = invoice?.invoice_pdf_path || invoice?.invoice_path`
- **Line 154**: `const signedUrl = await getSignedInvoiceUrl({ invoice_path: invoicePath })`
- **Line 272**: `{(invoice.invoice_pdf_path || invoice.invoice_path) && (`

#### `src/pages/customer/JobsListPage.jsx`
- **Line 49**: `invoice_path,`

#### `src/pages/customer/JobDetailPage.jsx`
- **Line 122**: `if (!job?.invoice_path) {`
- **Line 127**: `const signedUrl = await getSignedInvoiceUrl({ invoice_path: job.invoice_path })`
- **Line 136**: `if (!job?.invoice_path) {`
- **Line 141**: `const signedUrl = await getSignedInvoiceUrl({ invoice_path: job.invoice_path })`
- **Line 227**: `{isCompleted && job.invoice_path && (`

#### `src/components/customer/InvoiceCard.jsx`
- **Line 91**: `{(invoice.invoice_pdf_path || invoice.invoice_path) && (`

#### `src/components/customer/JobCard.jsx`
- **Line 79**: `{job.invoice_path && (`

#### `src/lib/nextActionEngine.js`
- **Line 107**: `* @param {Object} job - Job object with service_date, assigned_team_id, status, invoice_path, etc.`
- **Line 123**: `const hasInvoice = !!job.invoice_path;`
- **Line 216**: `const hasInvoice = !!job.invoice_path;`

#### `src/utils/revenuePipeline.js`
- **Line 53**: `* @param {Object} job - Job object with status, service_date, invoice_path, etc.`
- **Line 64**: `const hasInvoice = !!(job.invoice_path)`
- **Line 72**: `// INVOICED: invoice_path is not null`

#### `src/utils/signedInvoiceUrl.js`
- **Line 6**: `* @param {string} params.invoice_path - Path to the invoice file (format: companyId/jobId/...pdf)`
- **Line 9**: `* @throws {Error} If invoice_path is invalid or the edge function call fails`
- **Line 11**: `export async function getSignedInvoiceUrl({ invoice_path, expiresIn }) {`
- **Line 12**: `// Validate invoice_path`
- **Line 13**: `if (!invoice_path || typeof invoice_path !== "string" || invoice_path.trim() === "") {`
- **Line 23**: `path: invoice_path,`

#### `src/CustomerDashboard.jsx`
- **Line 816**: `{/* TODO: Legacy invoice generation. Prefer storage-backed invoice_path + signed URL like JobsAdmin/CustomerPortal. */}`
- **Line 873**: `{/* TODO: Legacy invoice generation. Prefer storage-backed invoice_path + signed URL like JobsAdmin/CustomerPortal. */}`

### Database Migrations / SQL Files

#### `supabase/migrations/20260206000015_customer_portal_rpcs_and_rls.sql`
- **Line 207**: `invoice_path text,`
- **Line 265**: `j.invoice_path,`

#### `supabase/migrations/20260206000013_demo_seed_and_purge.sql`
- **Line 319**: `INSERT INTO public.jobs (company_id, customer_id, services_performed, job_cost, status, service_date, completed, completed_at, invoice_path, invoice_uploaded_at, metadata)`
- **Line 428**: `INSERT INTO public.jobs (company_id, customer_id, services_performed, job_cost, status, service_date, completed, completed_at, invoice_path, invoice_uploaded_at, metadata)`

#### `supabase/migrations/20260206000009_add_audit_logging_to_rpcs.sql`
- **Line 431**: `v_invoice_pdf_path := v_job.invoice_path;`

#### `supabase/migrations/20260206000007_invoice_upsert_due_date_recompute_patch.sql`
- **Line 85**: `v_invoice_pdf_path := v_job.invoice_path;`

#### `supabase/migrations/20260206000005_create_invoices_table.sql`
- **Line 232**: `v_invoice_pdf_path := v_job.invoice_path;`

#### `supabase/migrations/20260125090000_invoices_private_and_job_invoice_path.sql`
- **Line 9**: `ADD COLUMN IF NOT EXISTS invoice_path text,`

#### `supabase/migrations/20260207150000_create_invoices_table.sql`
- **Line 49**: `-- optional PDF linkage (future-proof; you currently store PDF on jobs.invoice_path)`

---

## 2. INVOICE NEW: `invoices.invoice_pdf_path` / `invoices.pdf_path`

### Source Code Files

#### `src/pages/admin/RevenueHub.jsx`
- **Line 489**: `invoice_pdf_path: invoice.pdf_path,`
- **Line 767**: `const canMarkSent = isInvoiceFromTable && job.invoice_status === 'draft' && job.invoice_pdf_path`

#### `src/pages/customer/InvoicesListPage.jsx`
- **Line 54**: `invoice_pdf_path,`
- **Line 62**: `invoice_path: inv.invoice_pdf_path,`
- **Line 107**: `invoice_pdf_path: job.invoice_path,`

#### `src/pages/customer/InvoiceDetailPage.jsx`
- **Line 88**: `invoice_pdf_path: jobData.invoice_path,`
- **Line 133**: `const invoicePath = invoice?.invoice_pdf_path || invoice?.invoice_path`
- **Line 148**: `const invoicePath = invoice?.invoice_pdf_path || invoice?.invoice_path`
- **Line 272**: `{(invoice.invoice_pdf_path || invoice.invoice_path) && (`

#### `src/components/customer/InvoiceCard.jsx`
- **Line 91**: `{(invoice.invoice_pdf_path || invoice.invoice_path) && (`

### Database Migrations / SQL Files

#### `supabase/migrations/20260206000015_customer_portal_rpcs_and_rls.sql`
- **Line 375**: `invoice_pdf_path text`
- **Line 429**: `i.invoice_pdf_path`

#### `supabase/migrations/20260206000009_add_audit_logging_to_rpcs.sql`
- **Line 373**: `v_invoice_pdf_path text;`
- **Line 431**: `v_invoice_pdf_path := v_job.invoice_path;`
- **Line 446**: `-- 8) Determine status: if invoice_pdf_path exists, set to 'sent', else 'draft'`
- **Line 447**: `IF v_invoice_pdf_path IS NOT NULL AND length(trim(v_invoice_pdf_path)) > 0 THEN`
- **Line 478**: `invoice_pdf_path,`
- **Line 491**: `v_invoice_pdf_path,`
- **Line 501**: `invoice_pdf_path = EXCLUDED.invoice_pdf_path,`
- **Line 518**: `invoice_pdf_path,`
- **Line 530**: `v_invoice_pdf_path,`
- **Line 539**: `invoice_pdf_path = EXCLUDED.invoice_pdf_path,`
- **Line 679**: `-- Rule 3: If invoice_pdf_path exists and status is 'draft', set to 'sent'`
- **Line 680**: `ELSIF v_invoice.invoice_pdf_path IS NOT NULL`
- **Line 681**: `AND length(trim(v_invoice.invoice_pdf_path)) > 0`

#### `supabase/migrations/20260206000005_create_invoices_table.sql`
- **Line 35**: `invoice_pdf_path text NULL,`
- **Line 175**: `v_invoice_pdf_path text;`
- **Line 232**: `v_invoice_pdf_path := v_job.invoice_path;`
- **Line 247**: `-- 8) Determine status: if invoice_pdf_path exists, set to 'sent', else 'draft'`
- **Line 248**: `IF v_invoice_pdf_path IS NOT NULL AND length(trim(v_invoice_pdf_path)) > 0 THEN`
- **Line 265**: `invoice_pdf_path,`
- **Line 277**: `v_invoice_pdf_path,`
- **Line 286**: `invoice_pdf_path = EXCLUDED.invoice_pdf_path,`

#### `supabase/migrations/20260206000007_invoice_upsert_due_date_recompute_patch.sql`
- **Line 27**: `v_invoice_pdf_path text;`
- **Line 85**: `v_invoice_pdf_path := v_job.invoice_path;`
- **Line 100**: `-- 8) Determine status: if invoice_pdf_path exists, set to 'sent', else 'draft'`
- **Line 101**: `IF v_invoice_pdf_path IS NOT NULL AND length(trim(v_invoice_pdf_path)) > 0 THEN`
- **Line 132**: `invoice_pdf_path,`
- **Line 145**: `v_invoice_pdf_path,`
- **Line 155**: `invoice_pdf_path = EXCLUDED.invoice_pdf_path,`
- **Line 172**: `invoice_pdf_path,`
- **Line 184**: `v_invoice_pdf_path,`
- **Line 193**: `invoice_pdf_path = EXCLUDED.invoice_pdf_path,`

#### `supabase/migrations/20260206000006_invoice_due_date_and_status_automation.sql`
- **Line 126**: `-- Rule 3: If invoice_pdf_path exists and status is 'draft', set to 'sent'`
- **Line 127**: `ELSIF v_invoice.invoice_pdf_path IS NOT NULL`
- **Line 128**: `AND length(trim(v_invoice.invoice_pdf_path)) > 0`

#### `supabase/migrations/20260208000000_harden_audit_rate_limit_monitoring.sql`
- **Line 121**: `p_pdf_path text,`
- **Line 189**: `pdf_path = p_pdf_path,`
- **Line 203**: `pdf_path,`
- **Line 214**: `p_pdf_path,`
- **Line 237**: `'pdf_path', p_pdf_path`

#### `supabase/migrations/20260207170000_admin_upsert_invoice_for_job.sql`
- **Line 10**: `p_pdf_path text,`
- **Line 75**: `pdf_path = p_pdf_path,`
- **Line 89**: `pdf_path,`
- **Line 100**: `p_pdf_path,`

#### `supabase/migrations/20260207150000_create_invoices_table.sql`
- **Line 50**: `pdf_path text,`

---

## 3. ASSIGNMENT LEGACY: `assigned_to`, `assigned_crew_member_id`, `assigned_user_id`

### Source Code Files

#### `src/pages/admin/RevenueHub.jsx`
- **Line 92**: `.select('id, customer_id, status, service_date, scheduled_end_date, scheduled_date, job_cost, services_performed, invoice_path, invoice_uploaded_at, completed, completed_at, assigned_team_id, assigned_to, assigned_crew_member_id, assigned_user_id, created_at, updated_at')`
- **Line 383**: `const hasCrew = !!j.assigned_to || !!j.assigned_crew_member_id || !!j.assigned_user_id`

#### `src/lib/nextActionEngine.js`
- **Line 120**: `const hasCrew = !!job.assigned_to || !!job.assigned_crew_member_id || !!job.assigned_user_id;`
- **Line 208**: `const hasCrew = !!job.assigned_to || !!job.assigned_crew_member_id || !!job.assigned_user_id;`

### Database Migrations / SQL Files

#### `supabase/migrations/20260209190000_fix_payments_rls_team_assignments.sql`
- **Line 7**: `-- (only jobs directly assigned via assigned_to).`
- **Line 10**: `-- 1) Legacy: jobs.assigned_to = crew_member_id`
- **Line 34**: `j.assigned_to = public.current_crew_member_id()`

#### `supabase/migrations/20260210000000_job_notes_and_flags.sql`
- **Line 125**: `-- Legacy assigned_to`
- **Line 126**: `(j.assigned_team_id IS NULL AND j.assigned_to = public.current_crew_member_id())`
- **Line 163**: `-- Legacy assigned_to`
- **Line 164**: `(j.assigned_team_id IS NULL AND j.assigned_to = public.current_crew_member_id())`
- **Line 213**: `-- Legacy assigned_to`
- **Line 214**: `(j.assigned_team_id IS NULL AND j.assigned_to = public.current_crew_member_id())`
- **Line 251**: `-- Legacy assigned_to`
- **Line 252**: `(j.assigned_team_id IS NULL AND j.assigned_to = public.current_crew_member_id())`
- **Line 346**: `RAISE EXCEPTION 'forbidden_job_not_assigned_to_team';`
- **Line 349**: `-- Legacy: fall back to assigned_to check`
- **Line 350**: `IF v_job.assigned_to IS NULL OR v_job.assigned_to <> v_crew_member_id THEN`
- **Line 479**: `RAISE EXCEPTION 'forbidden_job_not_assigned_to_team';`
- **Line 482**: `-- Legacy: fall back to assigned_to check`
- **Line 483**: `IF v_job.assigned_to IS NULL OR v_job.assigned_to <> v_crew_member_id THEN`

#### `supabase/migrations/20260209000006_auto_link_invoice_id_in_record_payment.sql`
- **Line 117**: `-- Use team-based assignment if available, fall back to assigned_to for backward compatibility`
- **Line 133**: `RAISE EXCEPTION 'forbidden_job_not_assigned_to_team';`
- **Line 136**: `-- Legacy: fall back to assigned_to check`
- **Line 137**: `IF v_job.assigned_to IS NULL OR v_job.assigned_to <> v_crew_member_id THEN`

#### `supabase/migrations/20260209000005_fix_record_payment_external_ref_ambiguity.sql`
- **Line 106**: `-- Use team-based assignment if available, fall back to assigned_to for backward compatibility`
- **Line 122**: `RAISE EXCEPTION 'forbidden_job_not_assigned_to_team';`
- **Line 125**: `-- Legacy: fall back to assigned_to check`
- **Line 126**: `IF v_job.assigned_to IS NULL OR v_job.assigned_to <> v_crew_member_id THEN`

#### `supabase/migrations/20260209000004_fix_record_payment_column_names.sql`
- **Line 99**: `-- Use team-based assignment if available, fall back to assigned_to for backward compatibility`
- **Line 115**: `RAISE EXCEPTION 'forbidden_job_not_assigned_to_team';`
- **Line 118**: `-- Legacy: fall back to assigned_to check`
- **Line 119**: `IF v_job.assigned_to IS NULL OR v_job.assigned_to <> v_crew_member_id THEN`

#### `supabase/migrations/20260207160000_add_invoice_id_to_payments.sql`
- **Line 126**: `-- Use team-based assignment if available, fall back to assigned_to for backward compatibility`
- **Line 142**: `RAISE EXCEPTION 'forbidden_job_not_assigned_to_team';`
- **Line 145**: `-- Legacy: fall back to assigned_to check`
- **Line 146**: `IF v_job.assigned_to IS NULL OR v_job.assigned_to <> v_crew_member_id THEN`

#### `supabase/migrations/20260206000009_add_audit_logging_to_rpcs.sql`
- **Line 906**: `IF v_job.assigned_to IS NULL OR v_job.assigned_to <> v_crew_member_id THEN`
- **Line 926**: `COALESCE(v_job.assigned_to, public.current_crew_member_id()),`

#### `supabase/migrations/20260204000001_fix_record_payment_overload_and_balance.sql`
- **Line 1**: `-- 1) Drop the legacy overload that forces assigned_to logic`

#### `supabase/migrations/20260204000000_update_record_payment_team_based.sql`
- **Line 3**: `-- Update record_payment() RPC to use team-based assignment instead of assigned_to`
- **Line 80**: `RAISE EXCEPTION 'forbidden_job_not_assigned_to_team';`
- **Line 92**: `RAISE EXCEPTION 'forbidden_job_not_assigned_to_team';`

#### `supabase/migrations/20260203122643_payment_receipts.sql`
- **Line 64**: `j.assigned_to IN (`

#### `supabase/migrations/20260203111548_customer_files.sql`
- **Line 58**: `-- Crew member must be assigned to a job (via team or legacy assigned_to) that belongs to the customer`
- **Line 83**: `j.assigned_to IN (`

#### `supabase/migrations/20260203101400_add_payment_logging.sql`
- **Line 85**: `IF v_job.assigned_to IS NULL OR v_job.assigned_to <> v_crew_member_id THEN`
- **Line 105**: `COALESCE(v_job.assigned_to, public.current_crew_member_id()),`

#### `supabase/migrations/20260202133417_customer_activity_log.sql`
- **Line 57**: `-- Crew member must be assigned to a job (via team or legacy assigned_to) that belongs to the customer`
- **Line 82**: `j.assigned_to IN (`

#### `supabase/migrations/20260127000003_guard_jobs_assigned_to_legacy.sql`
- **Line 4**: `-- AB10-P5 Step 1: Database guardrail to prevent writes to jobs.assigned_to`
- **Line 5**: `-- - assigned_to is legacy and must not be written by the app going forward`
- **Line 10**: `-- Step A: Create trigger function to block writes to assigned_to`
- **Line 11**: `-- Maintenance bypass: Set app.allow_legacy_assigned_to_write = 'on' to allow writes`
- **Line 13**: `--   SELECT set_config('app.allow_legacy_assigned_to_write','on', true);`
- **Line 15**: `--   SELECT set_config('app.allow_legacy_assigned_to_write','off', true);`
- **Line 16**: `CREATE OR REPLACE FUNCTION public.block_jobs_assigned_to_write()`
- **Line 23**: `IF current_setting('app.allow_legacy_assigned_to_write', true) = 'on' THEN`
- **Line 27**: `-- For INSERT: block if assigned_to is not null`
- **Line 29**: `IF NEW.assigned_to IS NOT NULL THEN`
- **Line 30**: `RAISE EXCEPTION 'assigned_to is legacy and cannot be written. Use assigned_team_id instead. Attempted to insert job with assigned_to = %. To bypass for maintenance, set app.allow_legacy_assigned_to_write = ''on''', NEW.assigned_to;`
- **Line 34**: `-- For UPDATE: block if assigned_to changes`
- **Line 36**: `IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN`
- **Line 37**: `RAISE EXCEPTION 'assigned_to is legacy and cannot be modified. Use assigned_team_id instead. Attempted to change assigned_to from % to %. To bypass for maintenance, set app.allow_legacy_assigned_to_write = ''on''', OLD.assigned_to, NEW.assigned_to;`
- **Line 46**: `DROP TRIGGER IF EXISTS block_jobs_assigned_to_write_trigger ON public.jobs;`
- **Line 48**: `CREATE TRIGGER block_jobs_assigned_to_write_trigger`
- **Line 51**: `EXECUTE FUNCTION public.block_jobs_assigned_to_write();`
- **Line 54**: `COMMENT ON COLUMN public.jobs.assigned_to IS`

#### `supabase/migrations/20260127000001_ab10_migrate_workers_to_teams.sql`
- **Line 7**: `-- - Backfill jobs.assigned_team_id based on existing jobs.assigned_to`
- **Line 8**: `-- - Non-breaking: jobs.assigned_to remains unchanged`
- **Line 63**: `-- Only update rows where assigned_team_id is NULL and assigned_to is NOT NULL`
- **Line 70**: `WHERE j.assigned_to = cm.id`
- **Line 72**: `AND j.assigned_to IS NOT NULL`
- **Line 111**: `-- 4) Count jobs with assigned_to (existing)`
- **Line 112**: `SELECT COUNT(*) as jobs_with_assigned_to`
- **Line 114**: `WHERE assigned_to IS NOT NULL;`
- **Line 122**: `-- (assigned_to exists but assigned_team_id is NULL)`
- **Line 125**: `WHERE j.assigned_to IS NOT NULL`
- **Line 129**: `WHERE cm.id = j.assigned_to`
- **Line 152**: `-- 9) Sample check: Verify a few jobs have both assigned_to and assigned_team_id`
- **Line 155**: `j.assigned_to,`
- **Line 160**: `LEFT JOIN public.crew_members cm ON cm.id = j.assigned_to`
- **Line 162**: `WHERE j.assigned_to IS NOT NULL`
- **Line 204**: `'jobs with assigned_to' AS entity,`
- **Line 207**: `WHERE assigned_to IS NOT NULL`

#### `supabase/migrations/20260124190000_payments_ledger_overhaul.sql`
- **Line 144**: `IF v_job.assigned_to IS NULL OR v_job.assigned_to <> v_crew_member_id THEN`
- **Line 164**: `COALESCE(v_job.assigned_to, public.current_crew_member_id()),`
- **Line 291**: `AND j.assigned_to = public.current_crew_member_id()`

#### `supabase/migrations/20260126000000_fix_payment_received_by.sql`
- **Line 77**: `IF v_job.assigned_to IS NULL OR v_job.assigned_to <> v_crew_member_id THEN`
- **Line 97**: `COALESCE(v_job.assigned_to, public.current_crew_member_id()),`

#### `supabase/migrations/20260124201000_fix_rpc_external_ref_ambiguity.sql`
- **Line 77**: `IF v_job.assigned_to IS NULL OR v_job.assigned_to <> v_crew_member_id THEN`
- **Line 97**: `COALESCE(v_job.assigned_to, public.current_crew_member_id()),`

#### `supabase/migrations/20260124194500_payments_rpc_external_ref.sql`
- **Line 77**: `IF v_job.assigned_to IS NULL OR v_job.assigned_to <> v_crew_member_id THEN`
- **Line 97**: `COALESCE(v_job.assigned_to, public.current_crew_member_id()),`

---

## 4. ASSIGNMENT NEW: `assigned_team_id` (used alongside legacy checks)

### Multi-Field Assignment Logic

The following locations check multiple assignment fields (both new `assigned_team_id` and legacy fields):

#### `src/pages/admin/RevenueHub.jsx`
- **Line 381**: `const hasTeam = !!j.assigned_team_id`
- **Line 383**: `const hasCrew = !!j.assigned_to || !!j.assigned_crew_member_id || !!j.assigned_user_id`
- **Line 385**: `const isUnassigned = !hasTeam && !hasCrew`
- **Context**: Checks both team assignment and legacy crew assignment fields to determine if job is unassigned

#### `src/lib/nextActionEngine.js`
- **Line 119**: `const hasTeam = !!job.assigned_team_id;`
- **Line 120**: `const hasCrew = !!job.assigned_to || !!job.assigned_crew_member_id || !!job.assigned_user_id;`
- **Line 122**: `const isUnassigned = !hasTeam && !hasCrew;`
- **Context**: Defensive check for crew assignment using multiple legacy fields, combined with team check

- **Line 206**: `const hasTeam = !!job.assigned_team_id;`
- **Line 208**: `const hasCrew = !!job.assigned_to || !!job.assigned_crew_member_id || !!job.assigned_user_id;`
- **Line 210**: `const isUnassigned = !hasTeam && !hasCrew;`
- **Context**: Same multi-field assignment check in different function

---

## 5. DATABASE MIGRATIONS WITH LEGACY FIELD REFERENCES

### Migrations that reference `assigned_to`:

1. **`20260209190000_fix_payments_rls_team_assignments.sql`** - RLS policy using `assigned_to`
2. **`20260210000000_job_notes_and_flags.sql`** - Multiple RLS policies checking `assigned_to` as fallback
3. **`20260209000006_auto_link_invoice_id_in_record_payment.sql`** - Fallback to `assigned_to` check
4. **`20260209000005_fix_record_payment_external_ref_ambiguity.sql`** - Fallback to `assigned_to` check
5. **`20260209000004_fix_record_payment_column_names.sql`** - Fallback to `assigned_to` check
6. **`20260207160000_add_invoice_id_to_payments.sql`** - Fallback to `assigned_to` check
7. **`20260206000009_add_audit_logging_to_rpcs.sql`** - Uses `assigned_to` in audit logging
8. **`20260203122643_payment_receipts.sql`** - RLS policy using `assigned_to`
9. **`20260203111548_customer_files.sql`** - RLS policy using `assigned_to`
10. **`20260203101400_add_payment_logging.sql`** - Uses `assigned_to` in payment logging
11. **`20260202133417_customer_activity_log.sql`** - RLS policy using `assigned_to`
12. **`20260127000003_guard_jobs_assigned_to_legacy.sql`** - Guardrail trigger blocking writes to `assigned_to`
13. **`20260127000001_ab10_migrate_workers_to_teams.sql`** - Migration script that backfills `assigned_team_id` from `assigned_to`
14. **`20260124190000_payments_ledger_overhaul.sql`** - Uses `assigned_to` in payment RPC
15. **`20260126000000_fix_payment_received_by.sql`** - Uses `assigned_to` in payment RPC
16. **`20260124201000_fix_rpc_external_ref_ambiguity.sql`** - Uses `assigned_to` in payment RPC
17. **`20260124194500_payments_rpc_external_ref.sql`** - Uses `assigned_to` in payment RPC

### Migrations that reference `invoice_path`:

1. **`20260206000015_customer_portal_rpcs_and_rls.sql`** - RPC function parameter and usage
2. **`20260206000013_demo_seed_and_purge.sql`** - Seed data inserts
3. **`20260206000009_add_audit_logging_to_rpcs.sql`** - Copies `invoice_path` to `invoice_pdf_path`
4. **`20260206000007_invoice_upsert_due_date_recompute_patch.sql`** - Copies `invoice_path` to `invoice_pdf_path`
5. **`20260206000005_create_invoices_table.sql`** - Copies `invoice_path` to `invoice_pdf_path`
6. **`20260125090000_invoices_private_and_job_invoice_path.sql`** - Adds `invoice_path` column to jobs table

---

## Summary Statistics

- **Invoice Legacy (`jobs.invoice_path`)**: ~60+ occurrences across 15+ source files + 6 migrations
- **Invoice New (`invoices.invoice_pdf_path` / `invoices.pdf_path`)**: ~30+ occurrences across 5 source files + 8 migrations
- **Assignment Legacy (`assigned_to`, `assigned_crew_member_id`, `assigned_user_id`)**: ~10 occurrences in source files + 17 migrations
- **Multi-Field Assignment Logic**: 3 locations checking both new and legacy assignment fields

---

## Notes

1. The `signedInvoiceUrl.js` utility function accepts `invoice_path` as a parameter name, but this is just the parameter name - it can accept paths from either legacy or new fields.

2. Many migrations include fallback logic that checks `assigned_to` when `assigned_team_id` is NULL, indicating a gradual migration strategy.

3. The `20260127000003_guard_jobs_assigned_to_legacy.sql` migration includes a trigger that blocks writes to `assigned_to`, but allows reads for backward compatibility.

4. Several customer-facing pages use both `invoice_pdf_path` and `invoice_path` with fallback logic (`invoice?.invoice_pdf_path || invoice?.invoice_path`).
