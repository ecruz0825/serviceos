# Architecture Audit Report
**ServiceOps / Lawn Care App**  
**Date:** January 2025  
**Type:** READ-ONLY Architecture Analysis

---

## 1. FRONTEND STRUCTURE

### Main App Entry Points
- **`src/main.jsx`** - React app bootstrap with BrowserRouter, UserProvider, BrandProvider, Sentry initialization
- **`src/App.jsx`** - Main routing configuration with role-based route protection
- **`index.html`** - HTML entry point, PWA manifest configured

### Routing Structure
The app uses **React Router v7** with role-based route protection:

**Route Categories:**
- **Admin Routes** (`/admin/*`) - Protected by `allowedRoles={['admin']}`
  - `/admin` - Dashboard
  - `/admin/jobs` - Jobs management
  - `/admin/customers` - Customer management
  - `/admin/quotes` - Quote management
  - `/admin/revenue-hub` - Financial dashboard
  - `/admin/crew` - Crew member management
  - `/admin/teams` - Team management
  - `/admin/payments` - Payment tracking
  - `/admin/expenses` - Expense tracking
  - `/admin/recurring-jobs` - Recurring job templates
  - `/admin/schedule` - Dispatch/scheduling interface
  - `/admin/schedule/requests` - Schedule request approvals
  - `/admin/settings` - Company settings
  - `/admin/billing` - Subscription management
  - `/admin/onboarding` - Onboarding wizard

- **Customer Portal Routes** (`/customer/*`) - Protected by `allowedRoles={['customer']}`
  - `/customer` or `/customer/dashboard` - Customer dashboard
  - `/customer/jobs` - Customer job list
  - `/customer/jobs/:id` - Job detail
  - `/customer/quotes` - Quote list
  - `/customer/quotes/:id` - Quote detail
  - `/customer/invoices` - Invoice list
  - `/customer/invoices/:id` - Invoice detail
  - `/customer/schedule` - Schedule view
  - `/customer/profile` - Profile management

- **Crew Portal Routes** (`/crew/*`) - Protected by `allowedRoles={['crew', 'admin']}`
  - `/crew` - Crew dashboard
  - `/crew/jobs` - Mobile crew job list
  - `/crew/job/:id` - Job detail with photo upload
  - `/crew/help` - Help documentation

- **Platform Admin Routes** (`/platform/*`) - Protected by `allowedRoles={['platform_admin']}`
  - `/platform` - Platform dashboard
  - `/platform/companies` - Company list
  - `/platform/company/:id` - Company detail with support mode

- **Public Routes** (no auth required)
  - `/quote/:token` - Public quote acceptance
  - `/quote/:token/receipt` - Quote receipt
  - `/schedule/:token` - Public job schedule request

- **Auth Routes**
  - `/login` - Admin/crew login
  - `/customer/login` - Customer login
  - `/forgot-password` - Password reset request
  - `/reset-password` - Password reset
  - `/auth/callback` - OAuth callback handler
  - `/bootstrap/company` - Company creation/bootstrap

### Major Page Folders

**`src/pages/admin/`** - Admin interface pages
- `AdminDashboard.jsx` - Main admin dashboard with KPIs
- `JobsAdmin.jsx` - Job CRUD, filtering, invoice generation
- `CustomersAdmin.jsx` - Customer management with drawer UI
- `CrewAdmin.jsx` - Crew member management
- `TeamsAdmin.jsx` - Team creation and management
- `PaymentsAdmin.jsx` - Payment recording and ledger
- `ExpensesAdmin.jsx` - Expense tracking
- `QuotesAdmin.jsx` - Quote list and management
- `QuoteBuilder.jsx` - Quote creation/editing
- `RecurringJobsAdmin.jsx` - Recurring job template management
- `ScheduleAdmin.jsx` - **Main dispatch interface** (calendar, map, drag-drop)
- `ScheduleRequestsAdmin.jsx` - Schedule request approvals
- `RevenueHub.jsx` - **Financial dashboard** (AR aging, collections, trends)
- `BillingAdmin.jsx` - Stripe subscription management
- `Settings.jsx` - Company settings
- `OnboardingWizard.jsx` - First-time setup flow

**`src/pages/customer/`** - Customer portal pages
- `DashboardPage.jsx` - Customer dashboard with summary
- `JobsListPage.jsx` - Customer's job list
- `JobDetailPage.jsx` - Job detail with schedule request
- `QuotesListPage.jsx` - Quote list
- `QuoteDetailPage.jsx` - Quote detail and acceptance
- `InvoicesListPage.jsx` - Invoice list
- `InvoiceDetailPage.jsx` - Invoice detail and download
- `SchedulePage.jsx` - Customer schedule view
- `ProfilePage.jsx` - Customer profile
- `CustomerLogin.jsx` - Customer authentication
- `CustomerAcceptInvite.jsx` - Customer invite acceptance

**`src/pages/crew/`** - Crew portal pages
- `CrewDashboard.jsx` - Crew dashboard
- `CrewPortalMobile.jsx` - Mobile-optimized job list
- `CrewJobDetail.jsx` - Job detail with photo upload, payment recording
- `CrewHelp.jsx` - Help documentation

**`src/pages/platform/`** - Platform admin pages
- `PlatformDashboard.jsx` - Platform overview
- `PlatformCompanies.jsx` - Company list
- `PlatformCompanyDetail.jsx` - Company detail with support mode

**`src/pages/public/`** - Public-facing pages
- `PublicQuote.jsx` - Public quote acceptance (token-based)
- `PublicQuoteReceipt.jsx` - Quote receipt display
- `PublicJobScheduleRequest.jsx` - Public schedule request form

**`src/pages/auth/`** - Authentication pages
- `CompanyBootstrap.jsx` - Company creation flow
- `ForgotPassword.jsx` - Password reset request
- `ResetPassword.jsx` - Password reset form

### Shared Components

**`src/components/ui/`** - Reusable UI components
- `Button.jsx` - Button component with variants
- `Card.jsx` - Card container
- `PageHeader.jsx` - Page header with title/subtitle
- `ConfirmModal.jsx` - Confirmation dialog
- `InputModal.jsx` - Text input modal
- `Drawer.jsx` - Side drawer component
- `ComposeEmailModal.jsx` - Email composition modal
- `ConvertToJobModal.jsx` - Quote-to-job conversion modal

**`src/components/nav/`** - Navigation components
- `Sidebar.jsx` - Main sidebar navigation
- `Topbar.jsx` - Top navigation bar
- `navConfig.js` - **Role-based navigation configuration**

**`src/components/schedule/`** - Dispatch/scheduling components
- `ScheduleJobRow.jsx` - Job row in schedule view
- `CalendarMonth.jsx` - Month calendar view
- `CalendarWeek.jsx` - Week calendar view
- `DayJobsDrawer.jsx` - Day detail drawer

**`src/components/customer/`** - Customer portal components
- `SummaryCard.jsx` - Dashboard summary card
- `LoadingSkeleton.jsx` - Loading state
- `EmptyState.jsx` - Empty state display
- Plus 8 additional customer-specific components

**`src/components/crew/`** - Crew portal components
- `JobNextActionCallout.jsx` - Next action prompts
- `JobPhotoPanel.jsx` - Photo upload interface
- `JobProgressStepper.jsx` - Job progress indicator

**`src/components/revenue/`** - Revenue hub components
- `LifecycleStrip.jsx` - Revenue pipeline visualization
- `NextActionButton.jsx` - Action buttons for revenue items

**`src/components/collections/`** - Collections management
- `LogCollectionActionModal.jsx` - Log collection actions
- `SendCollectionEmailModal.jsx` - Send collection emails
- `SetFollowupModal.jsx` - Set follow-up dates

**Other Shared Components:**
- `OnboardingGuard.jsx` - Redirects incomplete onboarding
- `RootRedirect.jsx` - Role-based root redirect
- `SupportModeBanner.jsx` - Support mode indicator
- `PWAInstallPrompt.jsx` - PWA installation prompt
- `FeedbackForm.jsx` - Customer feedback form
- `InvoiceActions.jsx` - Invoice action buttons

### Layout System

**`src/layouts/`** - Layout wrappers
- **`AppShell.jsx`** - Main admin layout with sidebar/topbar
- **`CrewLayout.jsx`** - Legacy crew layout
- **`CrewLayoutV2.jsx`** - Modern crew layout (mobile-optimized)
- **`customer/CustomerAppShell.jsx`** - Customer portal layout
- **`PublicLayout.jsx`** - Public page layout

### UI System

**Tables:** Custom table implementations in admin pages (JobsAdmin, CustomersAdmin, etc.)

**Cards:** `src/components/ui/Card.jsx` - Reusable card component

**Forms:** Inline form implementations in admin pages, no dedicated form library

**Styling:** Tailwind CSS with custom configuration (`src/tailwind.config.js`)

---

## 2. CORE DOMAIN MODULES

### Jobs Module

**Key React Pages:**
- `src/pages/admin/JobsAdmin.jsx` - Main job management interface
- `src/pages/admin/JobsNeedsScheduling.jsx` - Jobs requiring scheduling
- `src/pages/customer/JobsListPage.jsx` - Customer job list
- `src/pages/customer/JobDetailPage.jsx` - Customer job detail
- `src/pages/crew/CrewJobDetail.jsx` - Crew job detail with photo upload

**Supporting Hooks:**
- `src/hooks/useCrewJobs.js` - Crew job fetching hook

**Services/API Calls:**
- Direct Supabase queries: `jobs` table with company_id filtering
- RPC calls:
  - `log_customer_activity` - Log job-related activity
  - `create_invoice` - Generate invoice from job
  - `send_invoice` - Send invoice email
  - `start_job_session` - Track job start time
  - `stop_job_session` - Track job completion time
  - `admin_convert_quote_to_job` - Convert quote to job
  - `request_job_reschedule` - Customer schedule request

**Supabase Tables Used:**
- `jobs` - Main job table
- `customers` - Job customer relationship
- `payments` - Job payments
- `invoices` - Job invoices
- `job_schedule_requests` - Schedule requests
- `customer_feedback` - Job feedback
- `job_flags` - Job flags/notes

**Key Features:**
- Job status workflow: Pending → In Progress → Completed
- Photo upload (before/after images)
- Invoice generation (PDF)
- Payment tracking
- Schedule request system
- Team assignment
- Recurring job templates

### Customers Module

**Key React Pages:**
- `src/pages/admin/CustomersAdmin.jsx` - Customer management with drawer UI
- `src/pages/customer/ProfilePage.jsx` - Customer profile management

**Supporting Hooks:**
- None (direct queries in components)

**Services/API Calls:**
- Direct Supabase queries: `customers` table with company_id filtering
- RPC calls:
  - `log_customer_activity` - Track customer interactions
  - `get_customer_dashboard_summary` - Customer dashboard data
  - `create_customer_login` - Create customer auth account
  - `set_customer_password` - Set customer password

**Supabase Tables Used:**
- `customers` - Main customer table
- `jobs` - Customer jobs
- `quotes` - Customer quotes
- `invoices` - Customer invoices
- `payments` - Customer payments
- `customer_activity_log` - Activity tracking
- `profiles` - Customer auth profiles

**Key Features:**
- Customer CRUD operations
- Activity logging
- Auto-linking customers to auth users by email
- Customer portal access
- KPI tracking (total paid, outstanding, jobs count)

### Crews Module

**Key React Pages:**
- `src/pages/admin/CrewAdmin.jsx` - Crew member management
- `src/pages/admin/TeamsAdmin.jsx` - Team management
- `src/pages/crew/CrewDashboard.jsx` - Crew dashboard
- `src/pages/crew/CrewPortalMobile.jsx` - Mobile crew interface

**Supporting Hooks:**
- `src/hooks/useCrewJobs.js` - Crew job fetching

**Services/API Calls:**
- Direct Supabase queries: `crew_members`, `teams`, `team_members` tables
- RPC calls:
  - `start_job_session` - Track job start
  - `stop_job_session` - Track job completion
  - `record_payment` - Crew payment recording

**Supabase Tables Used:**
- `crew_members` - Individual crew members
- `teams` - Team definitions
- `team_members` - Team membership (many-to-many)
- `jobs` - Assigned jobs
- `profiles` - Crew auth profiles

**Key Features:**
- Crew member management
- Team-based assignment
- Mobile-optimized crew portal
- Job session tracking
- Payment recording (crew can record payments for assigned jobs)

### Scheduling Module

**Key React Pages:**
- `src/pages/admin/ScheduleAdmin.jsx` - **Main dispatch interface**
- `src/pages/admin/ScheduleRequestsAdmin.jsx` - Schedule request approvals
- `src/pages/customer/SchedulePage.jsx` - Customer schedule view

**Supporting Hooks:**
- None (complex state management in ScheduleAdmin)

**Services/API Calls:**
- Direct Supabase queries: `jobs`, `teams`, `crew_members` tables
- RPC calls:
  - `get_optimized_route_for_day` - Route optimization
  - `apply_optimized_route_for_day` - Apply optimized route
  - `approve_job_schedule_request` - Approve schedule request
  - `decline_job_schedule_request` - Decline schedule request
  - `request_job_reschedule` - Customer schedule request

**Supabase Tables Used:**
- `jobs` - Jobs to schedule
- `teams` - Teams for assignment
- `crew_members` - Crew members
- `job_schedule_requests` - Schedule requests

**Key Features:**
- Calendar views (month, week, day)
- Map dispatch view (Leaflet integration)
- Drag-and-drop job assignment (@dnd-kit)
- Route optimization
- Schedule request system

### Dispatch System

**Main Files:**
- **`src/pages/admin/ScheduleAdmin.jsx`** - **Primary dispatch interface** (2,500+ lines)
  - Calendar views (month/week/day)
  - Map view with Leaflet
  - Drag-and-drop crew assignment
  - Route optimization
  - Crew view (list of jobs by crew)
  - Unassigned jobs view

**Components:**
- `src/components/schedule/ScheduleJobRow.jsx` - Draggable job row
- `src/components/schedule/CalendarMonth.jsx` - Month calendar
- `src/components/schedule/CalendarWeek.jsx` - Week calendar
- `src/components/schedule/DayJobsDrawer.jsx` - Day detail drawer

**Features:**
- **Calendar Views:** Month, week, and day views
- **Map Dispatch:** Leaflet map with job markers and route lines
- **Route Optimization:** RPC-based route optimization
- **Crew Assignment:** Drag-and-drop from unassigned to crew sections
- **Team Assignment:** Dropdown team selection per job
- **Real-time Updates:** Supabase realtime subscriptions

### Payments Module

**Key React Pages:**
- `src/pages/admin/PaymentsAdmin.jsx` - Payment ledger and management
- `src/pages/customer/InvoiceDetailPage.jsx` - Customer invoice view

**Supporting Hooks:**
- None (direct RPC calls)

**Services/API Calls:**
- RPC calls (server-side enforcement):
  - `record_payment` - Record payment (enforces tenant, role, assignment, prevents overpayment)
  - `void_payment` - Void payment (admin only)
- Direct queries: `payments` table (read-only via RLS)

**Supabase Tables Used:**
- `payments` - Payment ledger (append-only with void capability)
- `jobs` - Job payment relationships
- `overpayments_log` - Overpayment attempt logging
- `invoices` - Invoice payment tracking

**Key Features:**
- Professional ledger system (append-only, void capability)
- Role-based access (admin sees all, crew sees assigned jobs, customer sees own jobs)
- Overpayment prevention
- Payment method tracking
- Receipt number generation
- External reference tracking

### Expenses Module

**Key React Pages:**
- `src/pages/admin/ExpensesAdmin.jsx` - Expense tracking

**Supporting Hooks:**
- None

**Services/API Calls:**
- Direct Supabase queries: `expenses` table
- Edge function: `extract-expense-receipt` - AI receipt extraction

**Supabase Tables Used:**
- `expenses` - Expense records
- `expense_categories` - Expense categories

**Key Features:**
- Expense CRUD
- Receipt photo upload
- AI receipt extraction (edge function)
- Category tracking

### Revenue Dashboards

**Key React Pages:**
- `src/pages/admin/RevenueHub.jsx` - **Comprehensive financial dashboard** (4,500+ lines)

**Supporting Hooks:**
- None (complex RPC-based data fetching)

**Services/API Calls:**
- Extensive RPC calls:
  - `get_financial_snapshot_for_company` - Financial overview
  - `get_profit_snapshot_for_company` - Profit analysis
  - `get_ar_aging_for_company` - AR aging report
  - `get_cash_forecast_for_company` - Cash flow forecast
  - `get_collections_queue_for_company` - Collections queue
  - `get_collections_activity_for_company` - Collection activity
  - `get_collections_followups_for_company` - Follow-ups
  - `get_collections_escalations_for_company` - Escalations
  - `get_collections_cases_for_company` - Collection cases
  - `get_collections_case_metrics` - Case metrics
  - `get_cfo_trends_for_company` - CFO trends
  - `get_profit_trends_for_company` - Profit trends
  - `get_revenue_by_customer_for_company` - Revenue by customer
  - `get_revenue_by_month_for_company` - Revenue by month
  - `get_expenses_by_category_for_company` - Expenses by category
  - `send_invoice` - Send invoice email
  - `void_invoice` - Void invoice
  - `sync_collections_cases_from_escalations` - Sync cases
  - `log_collection_action_for_customer` - Log actions
  - `upsert_collection_followup` - Manage follow-ups
  - `assign_collections_case` - Assign cases
  - `set_collections_case_due_at` - Set due dates
  - `set_collections_case_next_action` - Set next actions
  - `append_collections_case_note` - Add notes
  - `set_collections_case_status` - Update status
  - `get_collections_case_detail` - Case detail
  - `eval_invoices_overdue_for_company` - Evaluate overdue

**Supabase Tables Used:**
- `jobs` - Job revenue
- `invoices` - Invoice data
- `payments` - Payment data
- `expenses` - Expense data
- `quotes` - Quote pipeline
- `collections_cases` - Collection cases
- `collections_escalations` - Escalations
- `collections_followups` - Follow-ups
- `collections_comms_activity` - Communication activity

**Key Features:**
- Financial snapshot dashboard
- AR aging analysis
- Cash flow forecasting
- Collections management
- Revenue trends (Recharts integration)
- Profit analysis
- Invoice management
- Collection case workflow

### Customer Portal

**Key React Pages:**
- `src/pages/customer/DashboardPage.jsx` - Customer dashboard
- `src/pages/customer/JobsListPage.jsx` - Job list
- `src/pages/customer/JobDetailPage.jsx` - Job detail
- `src/pages/customer/QuotesListPage.jsx` - Quote list
- `src/pages/customer/QuoteDetailPage.jsx` - Quote detail
- `src/pages/customer/InvoicesListPage.jsx` - Invoice list
- `src/pages/customer/InvoiceDetailPage.jsx` - Invoice detail
- `src/pages/customer/SchedulePage.jsx` - Schedule view
- `src/pages/customer/ProfilePage.jsx` - Profile management

**Layout:**
- `src/layouts/customer/CustomerAppShell.jsx` - Customer portal layout

**Services/API Calls:**
- RPC calls:
  - `get_customer_dashboard_summary` - Dashboard summary
  - `request_job_reschedule` - Schedule request
- Direct queries: `jobs`, `quotes`, `invoices`, `payments` (RLS-filtered)

**Supabase Tables Used:**
- `customers` - Customer records
- `jobs` - Customer jobs (RLS-filtered)
- `quotes` - Customer quotes (RLS-filtered)
- `invoices` - Customer invoices (RLS-filtered)
- `payments` - Customer payments (RLS-filtered)
- `job_schedule_requests` - Schedule requests

**Key Features:**
- Customer authentication
- Job viewing and schedule requests
- Quote viewing and acceptance
- Invoice viewing and download
- Schedule viewing
- Profile management

---

## 3. SUPABASE INTEGRATION

### Supabase Client Files

**`src/supabaseClient.js`** - Single shared Supabase client
- Uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- Configured with session persistence, auto-refresh, localStorage
- Single instance exported as `supabase`

### RPC Calls (Frontend)

**Payment Operations:**
- `record_payment` - Record payment (enforces tenant, role, prevents overpayment)
- `void_payment` - Void payment (admin only)

**Customer Operations:**
- `log_customer_activity` - Log customer interactions
- `get_customer_dashboard_summary` - Customer dashboard data
- `create_customer_login` - Create customer auth
- `set_customer_password` - Set customer password

**Job Operations:**
- `start_job_session` - Track job start
- `stop_job_session` - Track job completion
- `admin_convert_quote_to_job` - Convert quote to job
- `request_job_reschedule` - Customer schedule request
- `admin_resolve_job_flag` - Resolve job flags

**Invoice Operations:**
- `create_invoice` - Create invoice from job
- `send_invoice` - Send invoice email
- `void_invoice` - Void invoice
- `eval_invoices_overdue_for_company` - Evaluate overdue invoices

**Quote Operations:**
- `respond_to_quote_public` - Public quote acceptance
- `get_quote_public` - Get public quote by token
- `mark_quote_viewed_public` - Mark quote viewed
- `extend_quote_expiration` - Extend quote expiration
- `enqueue_quote_reminder_for_quote` - Queue reminder
- `enqueue_quote_reminders` - Queue all reminders

**Schedule Operations:**
- `get_optimized_route_for_day` - Route optimization
- `apply_optimized_route_for_day` - Apply optimized route
- `approve_job_schedule_request` - Approve schedule request
- `decline_job_schedule_request` - Decline schedule request

**Revenue/Financial Operations:**
- `get_financial_snapshot_for_company` - Financial overview
- `get_profit_snapshot_for_company` - Profit analysis
- `get_ar_aging_for_company` - AR aging
- `get_cash_forecast_for_company` - Cash forecast
- `get_collections_queue_for_company` - Collections queue
- `get_collections_activity_for_company` - Collection activity
- `get_collections_followups_for_company` - Follow-ups
- `get_collections_escalations_for_company` - Escalations
- `get_collections_cases_for_company` - Collection cases
- `get_collections_case_metrics` - Case metrics
- `get_collections_case_detail` - Case detail
- `get_cfo_trends_for_company` - CFO trends
- `get_profit_trends_for_company` - Profit trends
- `get_revenue_by_customer_for_company` - Revenue by customer
- `get_revenue_by_month_for_company` - Revenue by month
- `get_expenses_by_category_for_company` - Expenses by category
- `log_collection_action_for_customer` - Log collection action
- `upsert_collection_followup` - Manage follow-ups
- `assign_collections_case` - Assign case
- `set_collections_case_due_at` - Set due date
- `set_collections_case_next_action` - Set next action
- `append_collections_case_note` - Add note
- `set_collections_case_status` - Update status
- `sync_collections_cases_from_escalations` - Sync cases

**Platform Admin Operations:**
- `get_platform_summary` - Platform overview
- `get_platform_companies` - Company list
- `get_platform_company_detail` - Company detail
- `get_platform_company_history` - Company history
- `get_platform_company_events` - Company events
- `start_support_session` - Start support mode
- `end_support_session` - End support mode
- `get_active_support_session` - Get active session

**Company Operations:**
- `bootstrap_tenant_for_current_user` - Company bootstrap
- `get_company_plan_usage` - Plan usage/limits
- `seed_demo_data` - Seed demo data
- `purge_demo_data` - Purge demo data
- `insert_audit_log` - Audit logging

### Direct Table Queries

**Common Patterns:**
- All queries filter by `company_id` for tenant isolation
- RLS policies enforce additional filtering
- Common tables queried:
  - `jobs` - Job records
  - `customers` - Customer records
  - `crew_members` - Crew members
  - `teams` - Teams
  - `team_members` - Team membership
  - `quotes` - Quotes
  - `invoices` - Invoices
  - `payments` - Payments (read-only via RLS)
  - `expenses` - Expenses
  - `profiles` - User profiles
  - `companies` - Company settings
  - `job_schedule_requests` - Schedule requests
  - `customer_activity_log` - Activity logs
  - `recurring_jobs` - Recurring job templates

**Query Helpers:**
- `src/lib/dbSelects.js` - Centralized SELECT column definitions
  - `JOB_SELECT_REVENUE_HUB`
  - `JOB_SELECT_JOBS_ADMIN`
  - `INVOICE_SELECT_REVENUE_HUB`
  - etc.

### Edge Functions

**`supabase/functions/`** - Deno-based edge functions

1. **`auto-generate-recurring-jobs`** - Auto-generate jobs from recurring templates
2. **`create-billing-checkout-session`** - Create Stripe checkout session
3. **`create-billing-portal-session`** - Create Stripe customer portal session
4. **`create-customer-login`** - Create customer auth account
5. **`create-stripe-account-link`** - Create Stripe Connect account link
6. **`extract-expense-receipt`** - AI receipt extraction
7. **`invite-user`** - Invite user (crew/admin/customer)
8. **`send-quote-emails`** - Send quote emails
9. **`set-customer-password`** - Set customer password
10. **`signed-invoice-url`** - Generate signed invoice URLs
11. **`stripe-webhook`** - Handle Stripe webhooks

---

## 4. MULTI-TENANT SAFETY

### Company Isolation Mechanism

**Primary Isolation: `company_id` Column**

Every tenant-scoped table includes a `company_id` column:
- `jobs.company_id`
- `customers.company_id`
- `crew_members.company_id`
- `teams.company_id`
- `quotes.company_id`
- `invoices.company_id`
- `payments.company_id`
- `expenses.company_id`
- `profiles.company_id` (user's company)

### Profiles Table Usage

**`profiles` Table Structure:**
- `id` (UUID, FK to auth.users)
- `company_id` (UUID, FK to companies)
- `role` (text: 'admin', 'crew', 'customer', 'manager', 'dispatcher', 'platform_admin')
- `full_name` (text)

**How It Works:**
1. User authenticates via Supabase Auth
2. `UserContext` loads profile from `profiles` table using `auth.uid()`
3. Profile contains `company_id` and `role`
4. All queries filter by `company_id` from profile

**Key Files:**
- `src/context/UserContext.jsx` - Loads profile, provides `effectiveCompanyId`
- `src/hooks/useCompanySettings.js` - Fetches company settings using `effectiveCompanyId`

### RLS Assumptions in Frontend

**Frontend Assumes:**
1. RLS policies enforce `company_id` filtering automatically
2. Direct table queries can omit `company_id` filter (RLS adds it)
3. However, **most queries explicitly include `.eq('company_id', companyId)` for clarity and performance**

**RLS Enforcement:**
- RLS policies use helper functions:
  - `current_company_id()` - Returns user's company_id from profiles
  - `current_user_role()` - Returns user's role from profiles
  - `current_crew_member_id()` - Returns crew member ID for crew users

**Example RLS Pattern (from migrations):**
```sql
CREATE POLICY payments_select_admin
ON public.payments
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_user_role() = 'admin'
);
```

### Tenant Scoping Enforcement

**Three Layers of Protection:**

1. **Frontend Filtering:**
   - All queries explicitly include `.eq('company_id', companyId)`
   - `companyId` comes from `UserContext.effectiveCompanyId`
   - Support mode: `effectiveCompanyId` = `supportTargetCompanyId` (platform_admin can impersonate)

2. **RLS Policies:**
   - Database-level row filtering
   - Policies check `company_id = current_company_id()`
   - Role-based policies (admin sees all company data, crew sees assigned jobs, customer sees own data)

3. **RPC Functions:**
   - Server-side enforcement in RPC functions
   - RPCs read `company_id` from `profiles` table
   - RPCs validate `company_id` matches before operations
   - Example: `record_payment` validates job belongs to user's company

**Support Mode (Tenant Impersonation):**
- Platform admins can enter "support mode"
- `UserContext` provides `effectiveCompanyId` that switches to `supportTargetCompanyId`
- All queries use `effectiveCompanyId` instead of `profile.company_id`
- Support mode banner displayed when active
- Billing actions disabled in support mode

**Key Files:**
- `src/context/UserContext.jsx` - Manages `effectiveCompanyId` and support mode
- `src/pages/platform/PlatformCompanyDetail.jsx` - Support mode entry point
- `src/components/SupportModeBanner.jsx` - Support mode indicator

---

## 5. BILLING SYSTEM

### Stripe Usage

**Edge Functions:**
- `supabase/functions/create-billing-checkout-session` - Create Stripe checkout
- `supabase/functions/create-billing-portal-session` - Create customer portal
- `supabase/functions/stripe-webhook` - Handle Stripe webhooks

**Frontend Integration:**
- `src/pages/admin/BillingAdmin.jsx` - Billing management UI
- Uses `supabase.functions.invoke()` to call edge functions
- Stripe customer ID stored in `companies.stripe_customer_id`
- Stripe subscription ID stored in `companies.stripe_subscription_id`

### Subscription Checks

**Company-Level Subscription:**
- `companies.subscription_status` - Status: 'inactive', 'trialing', 'active', 'past_due', 'canceled', 'unpaid'
- `companies.plan` - Plan: 'starter', 'pro'
- `companies.trial_ends_at` - Trial expiration
- `companies.billing_grace_until` - Grace period end
- `companies.billing_updated_at` - Last sync time

**Profile-Level Access:**
- `UserContext` loads subscription data from `companies` table
- Profile object includes: `subscription_status`, `plan`, `trial_ends_at`, `billing_grace_until`, `billing_updated_at`

### Billing Gates

**Plan Limits:**
- RPC: `get_company_plan_usage` - Returns current usage vs. limits
- Limits checked:
  - `max_crew` - Maximum crew members
  - `max_customers` - Maximum customers
  - `max_jobs_per_month` - Maximum jobs per month
  - `max_storage_gb` - Maximum storage

**Plan Restriction Files:**
- `src/utils/handlePlanLimitError.jsx` - Plan limit error handler
- `src/pages/admin/BillingAdmin.jsx` - Displays usage vs. limits

**Billing Gate Enforcement:**
- Frontend checks plan limits before operations
- Error handling via `handlePlanLimitError`
- Plan limit errors show upgrade prompts

### Files Controlling Billing

**Frontend:**
- `src/pages/admin/BillingAdmin.jsx` - Billing UI, checkout/portal initiation
- `src/context/UserContext.jsx` - Loads subscription data
- `src/utils/handlePlanLimitError.jsx` - Plan limit error handling

**Backend (Edge Functions):**
- `supabase/functions/create-billing-checkout-session/index.ts`
- `supabase/functions/create-billing-portal-session/index.ts`
- `supabase/functions/stripe-webhook/index.ts`

**Database:**
- `companies` table - Subscription data
- RPC: `get_company_plan_usage` - Usage/limits query

---

## 6. DISPATCH SYSTEM

### Calendar Views

**Main File:** `src/pages/admin/ScheduleAdmin.jsx` (2,500+ lines)

**View Types:**
1. **Month View** - `CalendarMonth` component
2. **Week View** - `CalendarWeek` component
3. **Day View** - Day detail drawer
4. **Crew View** - List of jobs grouped by crew/team
5. **Map View** - Leaflet map with job markers

**Components:**
- `src/components/schedule/CalendarMonth.jsx` - Month calendar
- `src/components/schedule/CalendarWeek.jsx` - Week calendar
- `src/components/schedule/DayJobsDrawer.jsx` - Day detail
- `src/components/schedule/ScheduleJobRow.jsx` - Job row

### Map Dispatch

**Implementation:**
- Uses **Leaflet** (`react-leaflet`) for map rendering
- Map view shows:
  - Job markers at customer addresses
  - Route lines connecting jobs
  - Crew color coding
  - Popup with job details

**Route Display:**
- Polyline connections between jobs
- Optimized route visualization

### Route Optimization

**RPC Functions:**
- `get_optimized_route_for_day` - Calculate optimized route
- `apply_optimized_route_for_day` - Apply route to jobs

**Usage:**
- Admin selects date range
- Calls `get_optimized_route_for_day` to get optimized order
- Displays route on map
- Admin can apply route to update job order

### Crew Assignment

**Assignment Methods:**
1. **Drag-and-Drop** - @dnd-kit library
   - Drag job from unassigned to crew section
   - Visual feedback during drag
2. **Dropdown Selection** - Per-job team dropdown
3. **Bulk Assignment** - Assign multiple jobs to team

**Team-Based Assignment:**
- Jobs assigned to `teams` (not individual crew)
- `assigned_team_id` on jobs table
- Teams can have multiple crew members
- Single-member teams display as crew member name

### Drag-Drop Dispatch

**Library:** `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`

**Implementation:**
- `DndContext` wraps schedule interface
- `useDraggable` for job rows
- `useDroppable` for crew drop zones
- Drag overlay for visual feedback
- On drop: Updates `jobs.assigned_team_id` via Supabase

**Files:**
- `src/pages/admin/ScheduleAdmin.jsx` - Main dispatch interface with drag-drop
- `CrewJobRow` component - Draggable job row
- `CrewDropZone` component - Drop zone for crew sections

### Main Files Powering Dispatch

1. **`src/pages/admin/ScheduleAdmin.jsx`** - Primary dispatch interface
   - Calendar views
   - Map view
   - Drag-drop assignment
   - Route optimization
   - Crew view
   - Unassigned jobs view

2. **`src/components/schedule/`** - Schedule components
   - `ScheduleJobRow.jsx`
   - `CalendarMonth.jsx`
   - `CalendarWeek.jsx`
   - `DayJobsDrawer.jsx`

3. **`src/utils/jobAssignment.js`** - Job assignment utilities

4. **Database Tables:**
   - `jobs` - Job records with `assigned_team_id`, `service_date`
   - `teams` - Team definitions
   - `team_members` - Team membership
   - `job_schedule_requests` - Schedule requests

---

## 7. DATA FLOW

### Customer → Job → Dispatch → Payment Workflow

#### Step 1: Customer Creation/Quote

**Frontend Files:**
- `src/pages/admin/CustomersAdmin.jsx` - Create customer
- `src/pages/admin/QuoteBuilder.jsx` - Create quote

**Backend Tables:**
- `customers` - Customer record created
- `quotes` - Quote created with `customer_id`, `status='draft'`

**Data Flow:**
1. Admin creates customer in CustomersAdmin
2. Admin creates quote in QuoteBuilder
3. Quote sent to customer (email via edge function)
4. Customer views quote at `/quote/:token` (public route)
5. Customer accepts quote → `respond_to_quote_public` RPC

#### Step 2: Quote → Job Conversion

**Frontend Files:**
- `src/pages/admin/QuoteBuilder.jsx` - Convert quote to job
- `src/pages/admin/JobsAdmin.jsx` - Job management

**RPC Call:**
- `admin_convert_quote_to_job` - Converts quote to job

**Backend Tables:**
- `quotes` - Status updated to 'accepted'
- `jobs` - New job created with:
  - `customer_id` (from quote)
  - `company_id` (from admin's profile)
  - `status='Pending'`
  - `job_cost` (from quote total)
  - `services_performed` (from quote)

**Data Flow:**
1. Admin clicks "Convert to Job" in QuoteBuilder
2. RPC `admin_convert_quote_to_job` creates job
3. Job appears in JobsAdmin
4. Job appears in ScheduleAdmin (unassigned)

#### Step 3: Job → Dispatch/Scheduling

**Frontend Files:**
- `src/pages/admin/ScheduleAdmin.jsx` - Dispatch interface
- `src/pages/admin/ScheduleRequestsAdmin.jsx` - Schedule request approvals

**Backend Tables:**
- `jobs` - Updated with:
  - `assigned_team_id` (from drag-drop or dropdown)
  - `service_date` (scheduled date)
  - `scheduled_end_date` (optional end date)
- `job_schedule_requests` - If customer requested schedule

**Data Flow:**
1. Admin opens ScheduleAdmin
2. Sees unassigned job in "Unassigned" section
3. Drags job to crew/team section OR selects team from dropdown
4. Sets `service_date` via calendar
5. Job now appears in crew's assigned jobs
6. Optional: Customer requests reschedule → `request_job_reschedule` RPC
7. Admin approves/declines in ScheduleRequestsAdmin

#### Step 4: Dispatch → Crew Execution

**Frontend Files:**
- `src/pages/crew/CrewPortalMobile.jsx` - Crew job list
- `src/pages/crew/CrewJobDetail.jsx` - Job execution

**RPC Calls:**
- `start_job_session` - Track job start
- `stop_job_session` - Track job completion

**Backend Tables:**
- `jobs` - Updated with:
  - `status='In Progress'` (when started)
  - `before_image` (photo upload)
  - `after_image` (photo upload)
  - `status='Completed'` (when finished)
  - `completed_at` (timestamp)

**Data Flow:**
1. Crew member opens CrewPortalMobile
2. Sees assigned jobs for today/upcoming
3. Opens job detail
4. Starts job → `start_job_session` RPC
5. Uploads before photo
6. Performs work
7. Uploads after photo
8. Completes job → `stop_job_session` RPC
9. Job status → 'Completed'

#### Step 5: Job → Invoice Generation

**Frontend Files:**
- `src/pages/admin/JobsAdmin.jsx` - Invoice generation
- `src/utils/invoiceGenerator.js` - PDF generation

**RPC Calls:**
- `create_invoice` - Create invoice record
- `send_invoice` - Send invoice email

**Backend Tables:**
- `invoices` - New invoice created with:
  - `job_id` (FK to jobs)
  - `customer_id` (from job)
  - `company_id` (from job)
  - `total` (from job.job_cost)
  - `status='draft'` or 'sent'
  - `pdf_path` (storage path)
- `jobs` - Updated with `invoice_path`

**Data Flow:**
1. Admin clicks "Generate Invoice" in JobsAdmin
2. `create_invoice` RPC creates invoice record
3. PDF generated client-side (jsPDF)
4. PDF uploaded to Supabase Storage
5. Invoice record updated with `pdf_path`
6. Optional: `send_invoice` RPC sends email to customer

#### Step 6: Invoice → Payment

**Frontend Files:**
- `src/pages/admin/PaymentsAdmin.jsx` - Payment recording
- `src/pages/crew/CrewJobDetail.jsx` - Crew payment recording

**RPC Calls:**
- `record_payment` - Record payment (server-side enforcement)

**Backend Tables:**
- `payments` - New payment record:
  - `job_id` (FK to jobs)
  - `invoice_id` (optional, FK to invoices)
  - `amount` (payment amount)
  - `payment_method` (Cash, Check, Card, Stripe, etc.)
  - `company_id` (from profile)
  - `status='posted'`
  - `paid_at` (timestamp)
  - `received_by` (user ID)
  - `receipt_number` (auto-generated)

**Data Flow:**
1. Admin or crew records payment in PaymentsAdmin or CrewJobDetail
2. Calls `record_payment` RPC with job_id, amount, method
3. RPC validates:
   - User's company matches job's company
   - Role allows payment recording (admin or crew)
   - Crew can only record for assigned jobs
   - Amount doesn't exceed job cost (overpayment prevention)
4. Payment inserted into `payments` table
5. Payment appears in PaymentsAdmin ledger
6. Customer can see payment in customer portal

#### Step 7: Payment → Revenue Hub

**Frontend Files:**
- `src/pages/admin/RevenueHub.jsx` - Financial dashboard

**RPC Calls:**
- `get_financial_snapshot_for_company` - Financial overview
- `get_ar_aging_for_company` - AR aging
- `get_cash_forecast_for_company` - Cash forecast
- `get_collections_queue_for_company` - Collections queue

**Backend Tables:**
- `payments` - Payment data aggregated
- `invoices` - Invoice data aggregated
- `jobs` - Job revenue data
- `collections_cases` - Collection cases (if overdue)

**Data Flow:**
1. RevenueHub loads financial data via RPCs
2. Displays:
   - Total revenue (sum of payments)
   - Outstanding AR (invoices - payments)
   - AR aging buckets (0-30, 31-60, 61-90, 90+ days)
   - Cash forecast
   - Collections queue (overdue invoices)
3. Admin can manage collections cases
4. Admin can send collection emails
5. Admin can log collection actions

### Complete Flow Summary

```
1. Customer Created
   └─> customers table
   
2. Quote Created
   └─> quotes table (customer_id)
   └─> Email sent (edge function)
   
3. Customer Accepts Quote
   └─> quotes.status = 'accepted'
   └─> RPC: respond_to_quote_public
   
4. Quote → Job Conversion
   └─> RPC: admin_convert_quote_to_job
   └─> jobs table created (customer_id, status='Pending')
   
5. Job Scheduled/Dispatched
   └─> ScheduleAdmin: Drag-drop or dropdown
   └─> jobs.assigned_team_id set
   └─> jobs.service_date set
   
6. Crew Executes Job
   └─> RPC: start_job_session
   └─> Photo uploads (before_image, after_image)
   └─> RPC: stop_job_session
   └─> jobs.status = 'Completed'
   
7. Invoice Generated
   └─> RPC: create_invoice
   └─> invoices table created (job_id)
   └─> PDF generated and uploaded
   └─> Optional: RPC: send_invoice (email)
   
8. Payment Recorded
   └─> RPC: record_payment
   └─> payments table (job_id, amount, method)
   └─> Overpayment prevention enforced
   
9. Revenue Tracking
   └─> RevenueHub aggregates payments, invoices, jobs
   └─> AR aging, cash forecast, collections queue
```

### Key Integration Points

**Frontend → Backend:**
- Direct Supabase queries (with company_id filtering)
- RPC calls for complex operations
- Edge functions for external integrations (Stripe, email)

**Backend → Frontend:**
- Realtime subscriptions (Supabase channels)
- RLS policies enforce tenant isolation
- RPC functions enforce business rules

**External Services:**
- Stripe (billing)
- Email (quote/invoice sending)
- Storage (PDFs, photos)

---

## Summary

This is a **multi-tenant SaaS application** for lawn care/service operations management with:

- **Strong tenant isolation** via company_id + RLS + RPC enforcement
- **Role-based access control** (admin, crew, customer, platform_admin)
- **Comprehensive dispatch system** with calendar, map, drag-drop
- **Financial management** with AR aging, collections, revenue tracking
- **Customer portal** for self-service
- **Crew portal** for mobile field operations
- **Stripe billing** integration with plan limits
- **Professional payment ledger** with overpayment prevention

The architecture follows a **defense-in-depth** approach with frontend filtering, RLS policies, and RPC server-side enforcement for multi-tenant safety.
