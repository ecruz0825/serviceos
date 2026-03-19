# LawnCare SaaS - Current State & Feature Inventory

**Last Updated:** February 2, 2026  
**Purpose:** Authoritative summary of existing features, data models, and constraints for continued development.

---

## 1. System Overview

The LawnCare SaaS is a multi-tenant business management platform for lawn care service companies. It provides end-to-end functionality for:

- **Admin Portal**: Complete business management including customer CRM, job scheduling, crew/team management, expense tracking, payment processing, quote generation, and reporting
- **Crew Portal**: Mobile-friendly interface for field workers to view assigned jobs, mark jobs complete with before/after photos, and record payments
- **Customer Portal**: Self-service portal for customers to view job history, invoices, make payments, and provide feedback
- **Public Pages**: Public-facing quote acceptance/rejection and job schedule request forms

**Multi-Tenant Architecture:**
- All data is scoped by `company_id` via Row Level Security (RLS)
- Core helper functions: `current_company_id()`, `current_user_role()`
- Three user roles: `admin`, `crew`, `customer`
- RLS policies enforce tenant isolation at the database level

**Security Model:**
- Supabase Auth for authentication
- RLS policies on all tables (company-scoped)
- Role-based access control (admin-only for most writes)
- Storage buckets with company-scoped path policies

---

## 2. Feature Inventory

| Module | Feature | Status | Where in Code | Data Model | Notes |
|--------|---------|-------|---------------|------------|-------|
| **Auth / Roles / Profiles** |
| | User Authentication | Done | `src/Login.jsx`, `src/CrewLogin.jsx` | `auth.users`, `profiles` | Supabase Auth with email/password |
| | Profile Management | Done | `supabase/migrations/20260126000002_profiles_setup_and_rls.sql` | `profiles` (id, email, full_name, role, company_id) | Auto-created on signup via trigger |
| | User Invitations | Done | `supabase/functions/invite-user/index.ts` | `profiles`, `crew_members` | Magic link invites, auto-assigns company_id |
| | Accept Invite Flow | Done | `src/AcceptInvite.jsx` | `profiles` | Updates profile with company_id and role |
| | Multi-tenant RLS | Done | All migrations | Helper: `current_company_id()`, `current_user_role()` | Company-scoped data access |
| **Admin Dashboard** |
| | Dashboard KPIs | Done | `src/pages/admin/AdminDashboard.jsx` | `jobs`, `payments`, `expenses` | Jobs today/week, overdue, revenue, unpaid invoices |
| | Navigation | Done | `src/components/nav/Sidebar.jsx`, `navConfig.js` | - | Role-based navigation |
| | Company Settings | Done | `src/pages/admin/Settings.jsx`, `src/hooks/useCompanySettings.js` | `companies` | Logo, display name, labels (crew/customer), primary color |
| **Customers (CRM)** |
| | Customer CRUD | Done | `src/pages/admin/CustomersAdmin.jsx` | `customers` (id, company_id, full_name, address, phone, email, tags, notes) | Full create/read/update/delete |
| | Customer Notes | Done | `src/pages/admin/CustomersAdmin.jsx` | `customer_notes` table | Timestamped notes per customer, separate from main notes field |
| | Customer Job History | Done | `src/pages/admin/CustomersAdmin.jsx` | `jobs` | View all jobs for a customer, quick job creation |
| | Customer PDF Export | Done | `src/utils/customerJobHistoryPDF.js` | `customers`, `jobs`, `payments` | Generates PDF with job history and payment summary |
| | Customer Search/Filter | Done | `src/pages/admin/CustomersAdmin.jsx` | `customers` | Search by name, filter by tags |
| **Jobs + Job Status Lifecycle** |
| | Job CRUD | Done | `src/pages/admin/JobsAdmin.jsx` | `jobs` | Create, edit, delete jobs |
| | Job Status Values | Done | Code references | Text field (not enum): "Scheduled", "In Progress", "Completed", "Canceled" | Status transitions managed in UI |
| | Job Assignment | Done | `src/pages/admin/JobsAdmin.jsx` | `jobs.assigned_team_id` (new), `jobs.assigned_to` (legacy) | Teams-based assignment with legacy fallback |
| | Job Photos | Done | `src/pages/admin/JobsAdmin.jsx`, `src/CrewPortal.jsx` | `jobs.before_image`, `jobs.after_image` | Stored in `job-images` bucket |
| | Job Completion | Done | `src/CrewPortal.jsx` | `jobs.status = 'Completed'` | Requires before/after photos |
| | Job Filtering | Done | `src/pages/admin/JobsAdmin.jsx` | `jobs` | By status, crew/team, date range, search |
| | Job Feedback | Done | `src/components/FeedbackForm.jsx` | `feedback` table | Customer feedback on completed jobs |
| | Job Cost Visibility | Done | Code logic | `jobs.job_cost` | Hidden in crew portal, visible to admin/customer |
| **Crew Portal** |
| | Crew Job List | Done | `src/CrewPortal.jsx` | `jobs` | Shows assigned jobs, filters by completion status |
| | Mark Job Complete | Done | `src/CrewPortal.jsx` | `jobs` | Upload before/after photos, update status |
| | Record Payment | Done | `src/CrewPortal.jsx` | `payments` via `record_payment()` RPC | Overpayment prevention, method selection |
| | Payment History | Done | `src/CrewPortal.jsx` | `payments` | View payments per job |
| | Crew Stats | Done | `src/CrewPortal.jsx` | `jobs`, `payments` | Completed jobs count, earnings |
| | Real-time Updates | Done | `src/CrewPortal.jsx` | Supabase Realtime | Subscribes to job changes |
| **Scheduling / Calendar** |
| | Calendar Views | Done | `src/pages/admin/ScheduleAdmin.jsx` | `jobs` | Agenda, Week, Month views |
| | Drag & Drop Scheduling | Done | `src/components/schedule/ScheduleJobRow.jsx` | `jobs.service_date` | Drag jobs to reschedule dates |
| | Undo Reschedule | Done | `src/pages/admin/ScheduleAdmin.jsx` | `jobs` | Token-based undo system for race condition prevention |
| | Day Jobs Drawer | Done | `src/components/schedule/DayJobsDrawer.jsx` | `jobs` | Click date to see all jobs for that day |
| | Deep Linking | Done | `src/pages/admin/ScheduleAdmin.jsx` | URL params | `?jobId=xxx&focusDate=yyyy-mm-dd` |
| | Filter by Crew/Team | Done | `src/pages/admin/ScheduleAdmin.jsx` | `jobs` | Filter calendar by assigned team |
| | Include/Exclude Canceled | Done | `src/pages/admin/ScheduleAdmin.jsx` | `jobs` | Toggle canceled jobs visibility |
| **Quotes** |
| | Quote Builder | Done | `src/pages/admin/QuoteBuilder.jsx` | `quotes` | Create quotes with services, subtotal, tax, total |
| | Quote Management | Done | `src/pages/admin/QuotesAdmin.jsx` | `quotes` | List, edit, send, view status |
| | Quote Numbering | Done | `supabase/migrations/20260128000000_quotes_module.sql` | `quote_counters`, trigger `assign_quote_number()` | Auto-increment per company |
| | Quote Status Enum | Done | Migration | `quote_status` enum: 'draft', 'sent', 'accepted', 'rejected', 'expired' | Status transitions |
| | Public Quote View | Done | `src/pages/public/PublicQuote.jsx` | `quotes` via `get_quote_public()` RPC | Token-based public access |
| | Quote Accept/Reject | Done | `src/pages/public/PublicQuote.jsx` | `quotes` via `accept_quote_public()` RPC | Creates job on accept, validates expiration |
| | Quote PDF Generation | Done | `src/utils/quotePdf.js`, `quotePdfUpload.js` | `quotes`, `quote-pdfs` bucket | Generates and stores PDF |
| | Quote Email Sending | Done | `supabase/functions/send-quote-emails/index.ts` | `quote_messages` | Resend API integration |
| | Quote Reminders | Done | `supabase/migrations/20260131125301_add_quote_reminders.sql` | `quote_reminders` table | Automated reminder system |
| | Quote Messages | Done | `supabase/migrations/20260129000001_quote_messages.sql` | `quote_messages` | Email history per quote |
| | Quote Expiration | Done | Migration | `quotes.valid_until`, `quotes.expires_at` | Auto-expire logic |
| | Quote Last Viewed | Done | Migration | `quotes.last_viewed_at` | Track customer engagement |
| **Payments** |
| | Payment Recording | Done | `supabase/migrations/20260124190000_payments_ledger_overhaul.sql` | `payments` via `record_payment()` RPC | Server-side enforcement, overpayment prevention |
| | Payment Ledger | Done | Migration | `payments` (status: 'posted'/'voided', paid_at, created_by, voided_at) | Append-only with void capability |
| | Payment History | Done | `src/pages/admin/PaymentsAdmin.jsx` | `payments` | View all payments, filter by job/customer |
| | Overpayment Prevention | Done | `record_payment()` RPC | `payments` | Rejects payments exceeding job_cost, logs attempts |
| | Payment Methods | Done | Code | `payments.payment_method` | Cash, Check, Card, Venmo, etc. |
| | Payment Receipts | Done | `supabase/migrations/20260124193000_payments_receipts.sql` | `payment_receipts` table, `payment-receipts` bucket | Store payment receipt images |
| | External Payment Ref | Done | `supabase/migrations/20260124194500_payments_rpc_external_ref.sql` | `payments.external_ref` | Link to external payment systems |
| **Expenses** |
| | Expense CRUD | Done | `src/pages/admin/ExpensesAdmin.jsx` | `expenses` (id, company_id, amount, date, category, note) | Full create/read/update/delete |
| | Expense Line Items | Done | `supabase/migrations/20260201150000_expense_items_table.sql` | `expense_items` (description, quantity, unit_price, line_total, category) | Multi-line item support |
| | Manual Line Item Editing | Done | `src/pages/admin/ExpensesAdmin.jsx` | `expense_items` | Add/remove/edit line items, auto-calculate totals |
| | Multi-page Receipt Upload | Done | `src/pages/admin/ExpensesAdmin.jsx` | `expenses.receipt_paths` (text[]), `expenses.receipt_path` (legacy) | Upload multiple receipt images |
| | Receipt Viewer Gallery | Done | `src/pages/admin/ExpensesAdmin.jsx` | `expense-receipts` bucket | Thumbnail grid + full-size modal viewer with navigation |
| | AI Receipt Extraction v2 | Done | `supabase/functions/extract-expense-receipt/index.ts` | `expenses`, `expense_items` | GPT-4o Vision extracts vendor, date, amount, category, line items, confidence scores |
| | Split Expenses | Done | `src/pages/admin/ExpensesAdmin.jsx` | `expenses`, `expense_items` | Split line items into new expenses, auto-delete original if all items split |
| | Expense Filtering | Done | `src/pages/admin/ExpensesAdmin.jsx` | `expenses` | By date range, category, receipt status, search |
| | Expense Reports | Done | `src/pages/admin/ExpensesAdmin.jsx` | `expenses` | KPIs, category breakdown, monthly spend, CSV export |
| **Recurring Jobs** |
| | Recurring Job CRUD | Done | `src/pages/admin/RecurringJobsAdmin.jsx` | `recurring_jobs` | Create/edit/delete recurring job templates |
| | Recurrence Types | Done | Code | `recurring_jobs.recurrence_type` | 'weekly', 'biweekly', 'monthly' |
| | Default Team Assignment | Done | `supabase/migrations/20260127000002_ab10_recurring_jobs_default_team_id.sql` | `recurring_jobs.default_team_id` | Auto-assign team to generated jobs |
| | Auto-Generate Jobs | Done | `supabase/functions/auto-generate-recurring-jobs/index.ts` | `jobs`, `recurring_jobs` | Edge function generates jobs 30 days ahead |
| | Pause/Resume | Done | `src/pages/admin/RecurringJobsAdmin.jsx` | `recurring_jobs.is_paused` | Pause generation without deleting |
| | Next Scheduled Preview | Done | `src/pages/admin/RecurringJobsAdmin.jsx` | Calculated | Shows next job date based on recurrence |
| **Invoicing/PDF Generation** |
| | Invoice Generation | Done | `src/utils/invoiceGenerator.js` | `jobs`, `payments` | jsPDF-based invoice with logo, payment summary |
| | Invoice Upload | Done | `src/utils/uploadInvoice.js` | `invoices` bucket, `jobs.invoice_path` | Upload PDF to private bucket |
| | Signed Invoice URLs | Done | `supabase/functions/signed-invoice-url/index.ts` | `invoices` bucket | Time-limited signed URLs for invoice access |
| | Invoice Actions | Done | `src/components/InvoiceActions.jsx` | `jobs` | Generate, upload, view, email invoice |
| | Invoice Watermark | Done | `src/utils/invoiceGenerator.js` | - | "PAID" or "UNPAID" watermark |
| **Storage Buckets/Policies** |
| | Job Images Bucket | Done | Code references | `job-images` (public) | Before/after photos |
| | Expense Receipts Bucket | Done | `supabase/migrations/20260201140000_expense_receipts_bucket_policies.sql` | `expense-receipts` (private) | Path: `{company_id}/expenses/{expense_id}/{timestamp}_{filename}` |
| | Quote PDFs Bucket | Done | `supabase/migrations/20260130000000_quote_pdfs_bucket_policies.sql` | `quote-pdfs` (private) | Path: `{company_id}/{quote_id}.pdf` |
| | Invoices Bucket | Done | `supabase/migrations/20260125090000_invoices_private_and_job_invoice_path.sql` | `invoices` (private) | Private bucket, signed URLs for access |
| | Payment Receipts Bucket | Done | `supabase/migrations/20260124193000_payments_receipts.sql` | `payment-receipts` (private) | Payment receipt images |
| | Company Logo | Done | `supabase/migrations/20260129000000_company_logo_path.sql` | `companies.logo_path` | Company logo storage path |
| **Teams Infrastructure** |
| | Teams CRUD | Done | `src/pages/admin/TeamsAdmin.jsx` | `teams` (id, company_id, name) | Create/edit/delete teams |
| | Team Members | Done | `supabase/migrations/20260127000000_ab10_teams_infrastructure.sql` | `team_members` (team_id, crew_member_id, role) | Assign crew members to teams |
| | Team Assignment | Done | `src/pages/admin/JobsAdmin.jsx` | `jobs.assigned_team_id` | Assign jobs to teams instead of individual crew |
| | Legacy Worker Support | Done | `supabase/migrations/20260127000003_guard_jobs_assigned_to_legacy.sql` | `jobs.assigned_to` | Backward compatibility for old assignments |
| | Team-of-One Display | Done | `src/pages/admin/JobsAdmin.jsx` | Logic | Shows worker name for single-person teams |
| **Schedule Requests** |
| | Public Schedule Request | Done | `src/pages/public/PublicJobScheduleRequest.jsx` | `job_schedule_requests` | Customers request job scheduling |
| | Schedule Request Admin | Done | `src/pages/admin/ScheduleRequestsAdmin.jsx` | `job_schedule_requests` | Approve/decline requests, create jobs |
| | Request Notifications | Done | `supabase/migrations/20260201000001_schedule_request_notifications.sql` | RPC functions | Email notifications on request creation |
| **Edge Functions** |
| | extract-expense-receipt | Done | `supabase/functions/extract-expense-receipt/index.ts` | `expenses`, `expense_items` | GPT-4o Vision AI extraction, multi-page support |
| | auto-generate-recurring-jobs | Done | `supabase/functions/auto-generate-recurring-jobs/index.ts` | `recurring_jobs`, `jobs` | Scheduled job generation (30-day window) |
| | invite-user | Done | `supabase/functions/invite-user/index.ts` | `auth.users`, `profiles`, `crew_members` | Send magic link invites |
| | send-quote-emails | Done | `supabase/functions/send-quote-emails/index.ts` | `quote_messages`, Resend API | Email quote PDFs to customers |
| | signed-invoice-url | Done | `supabase/functions/signed-invoice-url/index.ts` | `invoices` bucket | Generate time-limited signed URLs |
| **Reports** |
| | Business Summary | Done | `src/pages/admin/ReportsAdmin.jsx` | `payments`, `expenses` | Total income, expenses, net profit |
| | Expense Reports | Partial | `src/pages/admin/ExpensesAdmin.jsx` | `expenses` | KPIs, category breakdown, monthly spend (basic) |
| | Job Reports | Not Started | - | `jobs` | No dedicated job reporting yet |
| | Revenue Reports | Not Started | - | `payments`, `jobs` | No detailed revenue analytics |
| **Customer Portal** |
| | Job History View | Done | `src/pages/customer/CustomerPortal.jsx` | `jobs` | View all jobs, filter by status |
| | Invoice Viewing | Done | `src/pages/customer/CustomerPortal.jsx` | `jobs.invoice_path` | View invoices via signed URLs |
| | Payment Recording | Done | `src/CustomerDashboard.jsx` | `payments` via `record_payment()` RPC | Customers can record payments |
| | Feedback Submission | Done | `src/components/FeedbackForm.jsx` | `feedback` | Submit feedback on completed jobs |
| | Payment History | Done | `src/pages/customer/CustomerPortal.jsx` | `payments` | View payment history per job |

---

## 3. Database & Migrations Summary

### Key Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `profiles` | User profiles linked to auth.users | id (FK to auth.users), email, full_name, role, company_id |
| `companies` | Multi-tenant company records | id, name, logo_path, display_name, primary_color, crew_label, customer_label, auto_generate_recurring_jobs |
| `customers` | Customer records | id, company_id, full_name, address, phone, email, tags, notes |
| `customer_notes` | Timestamped customer notes | id, customer_id, note, created_at |
| `jobs` | Job/service records | id, company_id, customer_id, service_date, services_performed, job_cost, status, assigned_team_id, assigned_to (legacy), before_image, after_image, invoice_path |
| `recurring_jobs` | Recurring job templates | id, company_id, customer_id, start_date, recurrence_type, is_paused, default_team_id |
| `teams` | Crew teams | id, company_id, name |
| `team_members` | Team membership | id, team_id, crew_member_id, role |
| `crew_members` | Crew member records | id, company_id, user_id, full_name |
| `payments` | Payment ledger | id, company_id, job_id, amount, payment_method, status ('posted'/'voided'), paid_at, created_by, voided_at, void_reason, external_ref |
| `payment_receipts` | Payment receipt images | id, payment_id, receipt_path |
| `expenses` | Business expenses | id, company_id, amount, date, category, note, receipt_path (legacy), receipt_paths (text[]), receipt_uploaded_at |
| `expense_items` | Expense line items | id, company_id, expense_id, description, quantity, unit_price, line_total, category |
| `quotes` | Quote records | id, company_id, customer_id, quote_number, services (jsonb), subtotal, tax, total, status (enum), valid_until, notes, created_by, sent_at, accepted_at, rejected_at, last_viewed_at |
| `quote_counters` | Per-company quote numbering | company_id (PK), next_number |
| `quote_messages` | Quote email history | id, company_id, quote_id, to_email, subject, body, sent_at |
| `quote_reminders` | Automated quote reminders | id, quote_id, reminder_type, sent_at |
| `job_schedule_requests` | Customer schedule requests | id, company_id, job_id, quote_id, requested_date, customer_note, status ('requested'/'approved'/'declined') |
| `feedback` | Customer feedback | id, job_id, rating, comment, created_at |

### Recent Migrations (Expenses/Receipts)

- **20260202000000**: Added `receipt_paths text[]` to `expenses` for multi-page receipt support
- **20260201150000**: Created `expense_items` table with RLS policies and backfill helper
- **20260201140000**: Storage policies for `expense-receipts` bucket (company-scoped paths)
- **20260201133730**: Hardened expenses schema (NOT NULL constraints, indexes, receipt fields)

### Important Enums & Constraints

- **quote_status**: `'draft' | 'sent' | 'accepted' | 'rejected' | 'expired'`
- **payment status**: `'posted' | 'voided'` (CHECK constraint)
- **payment amount**: Must be > 0 (CHECK constraint)
- **recurrence_type**: `'weekly' | 'biweekly' | 'monthly'` (text, not enum)
- **job status**: Text field (not enum): Typically "Scheduled", "In Progress", "Completed", "Canceled"

### Helper Functions

- `current_company_id()`: Returns company_id from profiles for current user
- `current_user_role()`: Returns role from profiles for current user
- `current_crew_member_id()`: Returns crew_member_id for current user
- `record_payment()`: RPC to record payment with overpayment prevention
- `get_quote_public()`: RPC to fetch quote by token (public access)
- `accept_quote_public()`: RPC to accept quote and create job
- `mark_quote_viewed_public()`: RPC to track quote views

---

## 4. "Golden Rules" / Known Constraints

### Multi-Tenant Security
- **ALL** queries must filter by `company_id = current_company_id()`
- RLS policies enforce tenant isolation at database level
- Never trust client-side company_id - always use `current_company_id()` helper
- Storage bucket paths must include `{company_id}/` as first folder

### Job Cost Visibility
- `job_cost` is **hidden** in crew portal (RLS policy)
- `job_cost` is **visible** to admin and customer portals
- This is intentional for crew privacy

### Payment Rules
- Payments are **append-only** (cannot edit, only void)
- Overpayment attempts are **rejected** by `record_payment()` RPC
- Payment amount must be > 0 (database constraint)
- Payment status must be 'posted' or 'voided' (database constraint)

### Job Completion
- Jobs **cannot be marked complete** without before/after photos
- This is enforced in UI (crew portal requires image uploads)

### Quote Expiration
- Quotes have `valid_until` date
- Expired quotes cannot be accepted (enforced in `accept_quote_public()` RPC)
- Quote status auto-updates to 'expired' when past valid_until

### Expense Split Workflow
- If **all** line items are split successfully, original expense is **automatically deleted**
- If **partial** split or errors occur, original expense is **updated** with remaining items
- Split expenses inherit receipt paths from original

### Recurring Jobs
- Auto-generation runs via edge function (not real-time)
- Jobs generated 30 days ahead
- Only generates if `is_paused = false` and `auto_generate_recurring_jobs = true` on company
- Generated jobs inherit `default_team_id` from recurring_job

### Teams vs Legacy Workers
- New jobs should use `assigned_team_id` (teams-based)
- Legacy `assigned_to` (crew_member_id) is supported for backward compatibility
- Display logic: If team-of-one, show worker name; else show team name

### Storage Bucket Policies
- All private buckets require company-scoped paths: `{company_id}/...`
- RLS policies check first folder matches `current_company_id()`
- Admin-only for INSERT/UPDATE/DELETE, authenticated users for SELECT (same company)

### Invoice Generation
- Invoices are stored in **private** bucket
- Access via **signed URLs** (time-limited)
- Invoice path stored in `jobs.invoice_path` for reference

---

## 5. Current Roadmap State

### Next 10 Most Valuable Items (Not Yet Built)

1. **Job Reporting & Analytics** (Complexity: M)
   - Why: Need detailed job performance metrics, completion rates, revenue by team/customer
   - Dependencies: Jobs, payments, teams data
   - Gaps: No dedicated reporting module beyond basic business summary

2. **Payment Reminders / Automated Invoicing** (Complexity: M)
   - Why: Reduce manual follow-up, improve cash flow
   - Dependencies: Jobs, payments, email system (Resend)
   - Gaps: No automated payment reminder system

3. **Customer Portal Enhancements** (Complexity: S)
   - Why: Better self-service reduces support burden
   - Dependencies: Customer portal exists but basic
   - Gaps: Schedule request from portal, payment method storage, recurring payment setup

4. **Mobile App / PWA** (Complexity: L)
   - Why: Crew portal needs offline capability, better mobile UX
   - Dependencies: Crew portal, job completion flow
   - Gaps: No offline support, no app-like experience

5. **Advanced Expense Categorization** (Complexity: S)
   - Why: Better expense tracking and tax reporting
   - Dependencies: Expenses module
   - Gaps: No tax categories, no expense tags, no recurring expense templates

6. **Team Performance Tracking** (Complexity: M)
   - Why: Measure team efficiency, identify training needs
   - Dependencies: Teams, jobs, completion data
   - Gaps: No team metrics, no completion time tracking

7. **Customer Communication Hub** (Complexity: M)
   - Why: Centralize all customer communications
   - Dependencies: Customers, jobs, quotes
   - Gaps: No unified message history, no SMS integration

8. **Inventory / Equipment Tracking** (Complexity: L)
   - Why: Track equipment usage, maintenance, costs per job
   - Dependencies: Jobs, expenses
   - Gaps: No inventory module exists

9. **Route Optimization** (Complexity: L)
   - Why: Optimize daily routes for efficiency, reduce travel time
   - Dependencies: Jobs, scheduling, customer addresses
   - Gaps: No route planning, no map integration

10. **Advanced Quote Features** (Complexity: S)
    - Why: Better quote conversion, template system
    - Dependencies: Quotes module
    - Gaps: No quote templates, no quote versioning, no quote comparison

---

## Appendix: File Structure Reference

### Key Frontend Files
- `src/pages/admin/*` - Admin portal pages
- `src/pages/customer/*` - Customer portal pages
- `src/pages/public/*` - Public-facing pages
- `src/CrewPortal.jsx` - Crew portal main page
- `src/components/*` - Reusable UI components
- `src/utils/*` - Utility functions (PDF generation, etc.)

### Key Backend Files
- `supabase/migrations/*` - Database migrations
- `supabase/functions/*` - Edge functions
- Storage buckets: `job-images`, `expense-receipts`, `quote-pdfs`, `invoices`, `payment-receipts`

### Important Hooks & Context
- `src/hooks/useCompanySettings.js` - Company settings hook
- `src/hooks/useConfirm.jsx` - Confirmation dialog hook
- `src/context/UserContext.jsx` - User context (if exists)

---

**Note:** This document reflects the codebase as of February 2, 2025. Features marked as "Done" have been verified in code. Features marked as "Partial" may have basic implementation but lack advanced features. Features marked as "Not Started" are identified gaps.

