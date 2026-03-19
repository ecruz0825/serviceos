# Architect Brief: Lawn Care Multi-Tenant App

## 0) Project Basics

- **Package Manager**: npm
- **Scripts**:
  - `dev`: `vite` (development server)
  - `build`: `vite build` (production build)
  - `lint`: `eslint .`
  - `preview`: `vite preview`
- **Env Variables** (from `src/supabaseClient.js`):
  - `VITE_SUPABASE_URL` (required)
  - `VITE_SUPABASE_ANON_KEY` (required)
- **Hosting Assumptions**: Vite-based SPA (likely Vercel/Netlify compatible; PWA configured in `vite.config.js`)

## 1) Top-Level File Tree (only the important parts)

### src/pages
- **admin/**: `AdminDashboard.jsx`, `QuoteBuilder.jsx`, `QuotesAdmin.jsx`, `JobsAdmin.jsx`, `JobsNeedsScheduling.jsx`, `CustomersAdmin.jsx`, `PaymentsAdmin.jsx`, `ExpensesAdmin.jsx`, `RecurringJobsAdmin.jsx`, `ScheduleAdmin.jsx`, `ScheduleRequestsAdmin.jsx`, `RevenueHub.jsx`, `Settings.jsx`, `TeamsAdmin.jsx`, `CrewAdmin.jsx`, `OnboardingWizard.jsx`
- **crew/**: `CrewDashboard.jsx`, `CrewJobDetail.jsx`, `CrewPortalMobile.jsx`, `CrewHelp.jsx`
- **customer/**: `DashboardPage.jsx`, `JobsListPage.jsx`, `JobDetailPage.jsx`, `QuotesListPage.jsx`, `QuoteDetailPage.jsx`, `InvoicesListPage.jsx`, `InvoiceDetailPage.jsx`, `SchedulePage.jsx`, `ProfilePage.jsx`, `CustomerLogin.jsx`
- **public/**: `PublicQuote.jsx`, `PublicQuoteReceipt.jsx`, `PublicJobScheduleRequest.jsx`

### src/components
- **crew/**: `JobNextActionCallout.jsx`, `JobPhotoPanel.jsx`, `JobProgressStepper.jsx`
- **customer/**: 8 customer portal components
- **revenue/**: `NextActionButton.jsx` (and related)
- **schedule/**: 4 schedule components
- **ui/**: `Button.jsx`, `Card.jsx`, `Drawer.jsx`, `PageHeader.jsx`, `InputModal.jsx`, etc.

### supabase/migrations (latest 10 + key ones)
1. `20260211000001_drop_logo_url_column.sql` - Removes logo_url column
2. `20260211000000_remove_logo_url_from_public_rpcs.sql` - Cleans up public RPCs
3. `20260210180000_extend_company_branding_and_fix_public_quote_branding.sql` - Branding enhancements
4. `20260210000000_job_notes_and_flags.sql` - Adds job notes and flags system
5. `20260209190000_fix_payments_rls_team_assignments.sql` - Payment RLS fixes
6. `20260209000006_auto_link_invoice_id_in_record_payment.sql` - Auto-links payments to invoices
7. `20260208000000_harden_audit_rate_limit_monitoring.sql` - Audit logging hardening
8. `20260207180000_invoice_auto_status_and_balance.sql` - Invoice status automation
9. `20260207170000_admin_upsert_invoice_for_job.sql` - Admin invoice upsert RPC
10. `20260207160000_add_invoice_id_to_payments.sql` - Links payments to invoices
- **Key earlier migrations**:
  - `20260206000005_create_invoices_table.sql` - Creates invoices table with status enum
  - `20260206000004_admin_convert_quote_to_job.sql` - Admin quote-to-job conversion
  - `20260203130000_add_convert_quote_to_job_rpc.sql` - Public quote conversion
  - `20260128000000_quotes_module.sql` - Initial quotes system
  - `20260127000000_ab10_teams_infrastructure.sql` - Teams system
  - `20260126000002_profiles_setup_and_rls.sql` - Profiles and RLS

### supabase/functions
- **auto-generate-recurring-jobs** (`index.ts`): Cron-triggered edge function to generate jobs from recurring_jobs table
- **create-stripe-account-link** (`index.ts`): Stripe Connect account linking
- **extract-expense-receipt** (`index.ts`): OCR/AI receipt extraction
- **invite-user** (`index.ts`): Sends Supabase auth invite emails, creates profiles
- **send-quote-emails** (`index.ts`): Sends quote emails via Resend API
- **signed-invoice-url** (`index.ts`): Generates signed URLs for private invoice PDFs

## 2) Auth + Multi-tenant Model

- **company_id determination**: 
  - Frontend: Fetched from `profiles` table via `profiles.company_id` where `profiles.id = auth.uid()`
  - Pattern: `src/hooks/useCompanySettings.js`, `src/context/UserContext.jsx`
  - Helper: `current_company_id()` RPC function (used in RLS policies)
- **Roles representation**:
  - Stored in `profiles.role` enum: `'admin'`, `'crew'`, `'customer'`
  - Enforced via `ProtectedRoute.jsx` component checking `useUser().role`
  - RLS policies use `current_user_role()` helper function
- **Helpers**:
  - `current_company_id()`: Returns company_id from profiles for current user
  - `current_crew_member_id()`: Returns crew_member.id for current user (if linked)
  - `current_user_role()`: Returns role from profiles for current user
- **Auto-linking**: `UserContext.jsx` auto-links customer records to auth users by email

## 3) Core Lifecycle: Quote → Job → Invoice → Payment

### Quote Stage
- **Implementation**: 
  - Frontend: `src/pages/admin/QuoteBuilder.jsx`, `src/pages/admin/QuotesAdmin.jsx`
  - Public view: `src/pages/public/PublicQuote.jsx`
  - RPCs: `respond_to_quote_public()`, `admin_convert_quote_to_job()`, `convert_quote_to_job()` (with scheduling)
- **Status model**: `quotes.status` enum: `'draft'`, `'sent'`, `'accepted'`, `'rejected'`, `'expired'`
- **State transitions**:
  - Draft → Sent (via email sending in QuoteBuilder)
  - Sent → Accepted/Rejected (via public quote page or admin conversion)
  - Accepted → Job created (via `admin_convert_quote_to_job()` or public acceptance)
- **Missing/Inconsistent**:
  - Quote expiration logic exists but may need hardening
  - Quote reminders system exists but automation unclear

### Job Stage
- **Implementation**:
  - Frontend: `src/pages/admin/JobsAdmin.jsx`, `src/pages/crew/CrewJobDetail.jsx`
  - RPCs: Job CRUD via direct table access (RLS enforced)
- **Status model**: `jobs.status` text field (not enum): `'Pending'`, `'In Progress'`, `'Completed'`, `'Canceled'` (inconsistent casing)
- **State transitions**:
  - Created from quote (no dates) → Needs Scheduling queue
  - Scheduled (dates + team assigned) → Ready for crew
  - Crew starts → `started_at` timestamp set
  - Crew completes → `completed_at` timestamp set, `status = 'Completed'`
- **Missing/Inconsistent**:
  - Status field is text, not enum (inconsistent values possible)
  - Multiple assignment fields exist: `assigned_team_id`, `assigned_to` (legacy), `assigned_crew_member_id`, `assigned_user_id` (defensive checks needed)

### Invoice Stage
- **Implementation**:
  - Frontend: `src/pages/admin/JobsAdmin.jsx` (invoice generation section), `src/utils/invoiceGenerator.js`
  - Storage: `src/utils/uploadInvoice.js` (uploads to `invoices` bucket, private)
  - RPCs: `admin_upsert_invoice_for_job()`, `upsert_invoice_from_job()`, `recompute_invoice_status()`, `void_invoice()`
- **Status model**: `invoices.status` enum: `'draft'`, `'sent'`, `'paid'`, `'void'`, `'overdue'`
- **State transitions**:
  - Job completed → Admin generates PDF → `admin_upsert_invoice_for_job()` creates invoice row (status='draft')
  - PDF uploaded → `invoice_path` set on jobs table, `invoice_pdf_path` on invoices table
  - Admin marks sent → `recompute_invoice_status()` updates to 'sent'
  - Payments applied → Auto-updates balance_due, status to 'paid' when balance=0
  - Overdue detection → Trigger/function sets status='overdue' based on due_date
- **Missing/Inconsistent**:
  - Dual storage: `jobs.invoice_path` (legacy) + `invoices.pdf_path` (new). Migration incomplete.
  - Invoice number generation exists but format may vary
  - Due date calculation logic unclear

### Payment Stage
- **Implementation**:
  - Frontend: `src/pages/admin/PaymentsAdmin.jsx`, `src/pages/crew/CrewJobDetail.jsx` (payment form)
  - RPC: `record_payment(p_job_id, p_amount, p_method, p_notes, p_external_ref)`
- **Status model**: `payments.status` enum: `'posted'`, `'pending'`, `'void'` (voided payments have `voided_at` timestamp)
- **State transitions**:
  - Crew/Admin records payment → `record_payment()` RPC inserts payment (status='posted')
  - Payment linked to invoice via `invoice_id` (auto-linked if job has invoice)
  - Overpayment blocked (logged to `overpayments_log` table)
  - Admin can void payment → `void_payment()` RPC sets `voided_at`
- **Missing/Inconsistent**:
  - Payment-to-invoice linking is automatic but may miss edge cases
  - Balance calculations use both `payments` table (sum) and `invoices.balance_due` (may drift)

## 4) Revenue Hub / Central Cockpit

- **File path**: `src/pages/admin/RevenueHub.jsx`
- **Queues**:
  1. Quotes Needing Follow-up (draft/sent, or non-terminal without job)
  2. Jobs Needing Scheduling (no date OR no team assignment)
  3. Jobs Completed but Not Invoiced (completed + no invoice record/path)
  4. Invoices With Balance Due (has invoice + balance > 0)
  5. Jobs Needing Attention (jobs with open `job_flags`)
- **Data queries**: 
  - Quotes: `quotes` table filtered by status and `converted_job_id`
  - Jobs: `jobs` table with computed `balanceDue` from payments
  - Invoices: `invoices` table joined to jobs
  - Payments: Aggregated by `job_id` and `invoice_id`
  - Audit logs: `audit_log` table (recent 15)
  - Flags: `job_flags` table (open only)
- **Known issues**:
  - Defensive checks for multiple job assignment fields (legacy support)
  - Invoice balance calculation may drift if payments not properly linked
  - Backwards-compatible checks for missing `invoices`/`audit_log` tables

## 5) Admin Portal Key Screens

### Quote Builder
- **Path**: `src/pages/admin/QuoteBuilder.jsx`
- **Convert-to-job behavior**: 
  - Button calls `admin_convert_quote_to_job(quote_id)` RPC
  - Creates job with `service_date = NULL` (lands in Needs Scheduling)
  - Updates quote: `converted_job_id`, `status='accepted'`

### Jobs Admin
- **Path**: `src/pages/admin/JobsAdmin.jsx`
- **Invoice generation behavior**:
  - Admin clicks "Generate Invoice" → `generateInvoice()` from `src/utils/invoiceGenerator.js` creates PDF
  - PDF uploaded via `uploadInvoicePdf()` → `invoices` bucket (private)
  - `admin_upsert_invoice_for_job()` RPC creates/updates invoice row
  - Storage path: `invoices/{company_id}/{job_id}/invoice-{timestamp}.pdf`
- **Deep linking**: Supports `?openJobId={id}&action={schedule|invoice|collect_payment}` query params

### Payments Admin
- **Path**: `src/pages/admin/PaymentsAdmin.jsx`
- **record_payment behavior**: 
  - Calls `record_payment()` RPC with job_id, amount, method, notes, external_ref
  - RPC enforces: tenant isolation, role check (admin/crew), overpayment blocking
  - Auto-links to invoice if job has invoice_id
- **Visibility**: All payments for company (RLS enforced)
- **RLS assumptions**: Payments table RLS uses `current_company_id()`, crew can only record for assigned jobs

### Customers Admin
- **Path**: `src/pages/admin/CustomersAdmin.jsx`
- **Drawer tabs**: `overview`, `jobs`, `notes`, `timeline`, `files`, `actions`
- **Invoices tab**: Shows invoices for customer (from `invoices` table + legacy `jobs.invoice_path`)
- **Notes**: Customer notes stored in `customer_notes` table
- **Timeline**: `customer_activity_log` table (quotes, payments, schedule requests)

### Recurring Jobs Admin
- **Path**: `src/pages/admin/RecurringJobsAdmin.jsx`
- **Scheduler/cron wiring**: 
  - Edge function `auto-generate-recurring-jobs` (supabase/functions/auto-generate-recurring-jobs/index.ts)
  - Triggered via Supabase cron (pg_cron) or external scheduler
  - Checks `companies.auto_generate_recurring_jobs` flag
  - Generates jobs from `recurring_jobs` table based on `recurrence_type` (weekly/biweekly/monthly)

## 6) Crew Portal

- **Main dashboard path**: `src/pages/crew/CrewDashboard.jsx` (route: `/crew`)
- **Job list**: `src/pages/crew/CrewPortalMobile.jsx` (route: `/crew/jobs`)
- **Job detail flow**: `src/pages/crew/CrewJobDetail.jsx` (route: `/crew/job/:id`)
- **Photo upload implementation**:
  - Storage bucket: `images` (public)
  - Path: `job-images/{timestamp}-{filename}`
  - Helper: `src/utils/photoUpload.js` (validation, thumbnails)
  - Storage helper: `src/services/storage.js` (uploads to Supabase Storage)
  - Signed URLs: Not used for photos (bucket is public)
- **Navigation issues**: 
  - Crew portal uses `CrewLayoutV2.jsx` (no admin route leakage observed)
  - Dashboard link in nav goes to `/crew` (correct)

## 7) Customer Portal + Public Pages

### Public Quote View
- **Path**: `src/pages/public/PublicQuote.jsx` (route: `/quote/:token`)
- **Acceptance flow**:
  - Customer enters name, optional comment
  - Calls `respond_to_quote_public()` RPC with `p_action='accept'`
  - RPC creates job (with or without auto-scheduling based on quote settings)
  - Redirects to receipt page: `/quote/:token/receipt`
- **Public token**: `quotes.public_token` (UUID, indexed)

### Customer Login Portal
- **Paths**: 
  - Login: `src/pages/customer/CustomerLogin.jsx` (route: `/customer/login`)
  - Dashboard: `src/pages/customer/DashboardPage.jsx` (route: `/customer/dashboard`)
  - Jobs: `src/pages/customer/JobsListPage.jsx`, `JobDetailPage.jsx`
  - Quotes: `src/pages/customer/QuotesListPage.jsx`, `QuoteDetailPage.jsx`
  - Invoices: `src/pages/customer/InvoicesListPage.jsx`, `InvoiceDetailPage.jsx`
  - Schedule: `src/pages/customer/SchedulePage.jsx`

### Invoice Viewing
- **Path**: `src/pages/customer/InvoiceDetailPage.jsx`
- **Payment entry points**: 
  - Invoice detail page may have payment form (needs verification)
  - Customer portal RPCs: `get_customer_invoices()`, `get_customer_jobs()` (from migration `20260206000015_customer_portal_rpcs_and_rls.sql`)

## 8) Data Layer + Utilities

### Supabase Client Setup
- **File**: `src/supabaseClient.js`
- **Config**: Creates client with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- **Auth config**: Persist session, auto-refresh, detect session in URL

### Query Helpers
- **Company settings**: `src/hooks/useCompanySettings.js` (fetches company settings via profiles.company_id)
- **Crew jobs**: `src/hooks/useCrewJobs.js` (fetches jobs for crew member)
- **Revenue pipeline**: `src/utils/revenuePipeline.js` (computes paid totals from payments)

### Storage Helpers
- **Photo upload**: `src/utils/photoUpload.js` (validation, thumbnails)
- **Invoice upload**: `src/utils/uploadInvoice.js` (uploads to private `invoices` bucket)
- **Signed invoice URLs**: `src/utils/signedInvoiceUrl.js` (generates signed URLs for private invoices)
- **Storage service**: `src/services/storage.js` (generic image upload helper)

### Constants Files
- **Status values**: No centralized constants file found. Status values are:
  - Job status: `'Pending'`, `'In Progress'`, `'Completed'`, `'Canceled'` (text field, inconsistent)
  - Invoice status: `'draft'`, `'sent'`, `'paid'`, `'void'`, `'overdue'` (enum)
  - Payment status: `'posted'`, `'pending'`, `'void'` (enum)
  - Quote status: `'draft'`, `'sent'`, `'accepted'`, `'rejected'`, `'expired'` (text field)

## 9) Known Breakpoints / TODO / Placeholder Actions

### Placeholder Buttons/Routes
- Reports route redirects to `/admin` (`src/App.jsx` line 252)
- Some navigation may have dead links (needs audit)

### Failing Edge Cases
- **Job assignment fields**: Multiple legacy fields (`assigned_to`, `assigned_crew_member_id`, `assigned_user_id`) + new `assigned_team_id`. Defensive checks throughout codebase.
- **Invoice dual storage**: Both `jobs.invoice_path` (legacy) and `invoices.pdf_path` (new). Migration incomplete.
- **Payment-to-invoice linking**: Auto-linking may miss edge cases if invoice created after payment.
- **Overpayment blocking**: Works but may need refinement for partial payments.

### RLS Landmines
- **Payments RLS**: Crew can only record payments for assigned jobs (enforced in `record_payment()` RPC)
- **Invoice RLS**: Only admin/manager/dispatcher can update invoices (enforced in RLS policy)
- **Customer portal RPCs**: Must verify RLS on all customer-facing RPCs
- **Public quote RPCs**: Rate limiting exists but may need hardening

### Known Brittle Areas
- **Status field inconsistency**: Job status is text (not enum), allowing invalid values
- **Team vs legacy assignment**: Code checks multiple assignment fields defensively
- **Invoice balance drift**: Balance calculated from payments table, but `invoices.balance_due` may drift if not recomputed
- **Quote expiration**: Logic exists but edge cases may exist

## 10) "If we start Phase 0 tomorrow…"

1. **Audit and standardize job status values** (`src/pages/admin/JobsAdmin.jsx`, `src/pages/crew/CrewJobDetail.jsx`)
   - Create enum or constants file for job statuses
   - Migrate existing text values to standardized set
   - Update all status checks to use constants

2. **Complete invoice migration** (`supabase/migrations/`, `src/pages/admin/JobsAdmin.jsx`)
   - Migrate all `jobs.invoice_path` references to `invoices` table
   - Remove dual storage pattern
   - Update all invoice queries to use `invoices` table only

3. **Consolidate job assignment fields** (`supabase/migrations/`, all job-related components)
   - Remove legacy `assigned_to`, `assigned_crew_member_id`, `assigned_user_id` fields
   - Standardize on `assigned_team_id` only
   - Update all queries and components

4. **Fix payment-to-invoice linking edge cases** (`supabase/migrations/20260209000006_auto_link_invoice_id_in_record_payment.sql`, `src/pages/admin/PaymentsAdmin.jsx`)
   - Ensure payments created before invoice are retroactively linked
   - Add migration to backfill missing `invoice_id` on payments

5. **Harden quote expiration and reminders** (`supabase/migrations/20260131125301_add_quote_reminders.sql`, `src/pages/public/PublicQuote.jsx`)
   - Verify expiration logic in `respond_to_quote_public()` RPC
   - Test quote reminder automation
   - Add monitoring for expired quotes

6. **Standardize invoice balance calculations** (`src/pages/admin/RevenueHub.jsx`, `supabase/migrations/20260207180000_invoice_auto_status_and_balance.sql`)
   - Ensure `invoices.balance_due` is always computed from payments table
   - Add trigger/function to auto-recompute balance on payment changes
   - Remove manual balance updates

7. **Add constants file for status values** (new file: `src/lib/constants.js`)
   - Export job statuses, invoice statuses, payment statuses, quote statuses
   - Update all components to import from constants
   - Add TypeScript types if migrating to TS

8. **Audit and fix RLS policies** (all migration files with RLS)
   - Verify all tables have proper RLS policies
   - Test edge cases (crew accessing other company data, etc.)
   - Add RLS tests

9. **Complete recurring jobs automation** (`supabase/functions/auto-generate-recurring-jobs/index.ts`)
   - Verify cron job is configured in Supabase
   - Test job generation logic
   - Add monitoring/logging

10. **Add comprehensive error handling** (all RPC calls in frontend)
    - Standardize error messages
    - Add user-friendly error handling
    - Log errors to Sentry (already configured)
