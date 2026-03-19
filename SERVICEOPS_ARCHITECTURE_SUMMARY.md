# ServiceOps SaaS - Architecture Summary
**Complete Repository Analysis for Development Resumption**

**Date**: 2024-03-21  
**Purpose**: Comprehensive architecture overview for ChatGPT to resume roadmap execution

---

## 1. ARCHITECTURE OVERVIEW

### Frontend Framework
- **Framework**: React 19.1.0 with React Router 7.7.1
- **Build Tool**: Vite 7.0.4
- **Styling**: Tailwind CSS 3.4.17
- **UI Components**: Custom component library (`src/components/ui/`)
- **State Management**: React Context (UserContext, BrandContext)
- **Routing**: React Router with role-based route protection
- **Error Tracking**: Sentry integration
- **PWA Support**: Vite PWA plugin (basic setup)

### Backend Services
- **Database**: PostgreSQL via Supabase
- **Auth**: Supabase Auth with role-based access control
- **Storage**: Supabase Storage (invoices, receipts, customer files, quote PDFs)
- **Edge Functions**: Deno-based Supabase Edge Functions (13 functions)
- **Real-time**: Supabase Realtime subscriptions (jobs, routes)

### Routing Structure
- **Admin Portal**: `/admin/*` (protected, admin/manager/dispatcher roles)
- **Crew Portal**: `/crew/*` (protected, crew role)
- **Customer Portal**: `/customer/*` (protected, customer role)
- **Platform Admin**: `/platform/*` (protected, platform_admin role)
- **Public Routes**: `/quote/:id`, `/schedule/:token` (unauthenticated)
- **Auth Routes**: `/login`, `/forgot-password`, `/reset-password`, `/auth/callback`

### Major Directories
```
src/
├── pages/           # Route-based page components
│   ├── admin/       # 26 admin pages
│   ├── crew/        # 4 crew portal pages
│   ├── customer/    # 11 customer portal pages
│   ├── platform/    # 3 platform admin pages
│   ├── public/      # 3 public-facing pages
│   └── auth/        # 3 authentication pages
├── components/      # Reusable UI components
│   ├── ui/          # Base components (Button, Card, etc.)
│   ├── nav/         # Navigation components
│   ├── revenue/     # Revenue pipeline components
│   ├── collections/ # Collections workflow
│   ├── schedule/    # Scheduling components
│   ├── crew/        # Crew-specific components
│   └── customer/    # Customer portal components
├── layouts/         # Layout wrappers (AppShell, CrewLayout, etc.)
├── context/         # React context providers
├── hooks/           # Custom React hooks
├── utils/           # Utility functions
├── lib/             # Library code (db selects, demo mode, etc.)
└── services/        # Service layer (storage operations)

supabase/
├── migrations/      # 171 database migration files
├── functions/       # 13 Edge Functions
└── tests/           # SQL test files
```

---

## 2. DATABASE STRUCTURE

### Key Tables

#### Core Business Tables
- **`companies`**: Tenant companies (multi-tenant root)
  - Fields: `id`, `name`, `plan`, `subscription_status`, `stripe_customer_id`, `stripe_subscription_id`, `trial_ends_at`, `billing_grace_until`, `billing_updated_at`, `setup_completed_at`, `onboarding_step`
  
- **`profiles`**: User profiles (linked to `auth.users`)
  - Fields: `id` (FK to `auth.users`), `email`, `full_name`, `role`, `company_id`
  - Roles: `admin`, `manager`, `dispatcher`, `crew`, `customer`, `platform_admin`
  
- **`customers`**: Customer records
  - Fields: `id`, `company_id`, `full_name`, `email`, `phone`, `address`, `user_id` (FK to `auth.users`), `tags`, `notes`
  
- **`jobs`**: Service jobs
  - Fields: `id`, `company_id`, `customer_id`, `service_date`, `scheduled_start`, `scheduled_end`, `services_performed`, `job_cost`, `status`, `assigned_team_id`, `recurring_job_id`, `invoice_id`, `invoice_path`, `completed_at`, `created_at`
  
- **`payments`**: Payment records (append-only ledger)
  - Fields: `id`, `company_id`, `job_id`, `invoice_id`, `amount`, `payment_method`, `date_paid`, `paid_at`, `status` (`posted`/`voided`), `created_by`, `voided_at`, `void_reason`, `receipt_number`, `external_ref`, `received_by`
  
- **`invoices`**: Invoice records
  - Fields: `id`, `company_id`, `job_id`, `customer_id`, `invoice_number`, `amount`, `due_date`, `status`, `pdf_path`, `sent_at`, `paid_at`
  
- **`quotes`**: Quote/proposal records
  - Fields: `id`, `company_id`, `customer_id`, `quote_number`, `amount`, `status`, `expires_at`, `last_viewed_at`, `pdf_path`, `accepted_at`, `rejected_at`
  
- **`recurring_jobs`**: Recurring job templates
  - Fields: `id`, `company_id`, `customer_id`, `recurrence_type` (`weekly`/`biweekly`/`monthly`), `start_date`, `last_generated_date`, `default_team_id`, `is_paused`
  
- **`crew_members`**: Crew/worker records
  - Fields: `id`, `company_id`, `full_name`, `email`, `phone`, `role`, `user_id` (FK to `auth.users`)
  
- **`teams`**: Team records
  - Fields: `id`, `company_id`, `name`, `color`
  
- **`team_members`**: Crew-to-team assignments
  - Fields: `team_id`, `crew_member_id`
  
- **`route_runs`**: Route generation runs
  - Fields: `id`, `company_id`, `team_id`, `route_date`, `status` (`draft`/`published`), `created_at`
  
- **`route_stops`**: Route stop records
  - Fields: `id`, `route_run_id`, `job_id`, `stop_order`, `estimated_arrival`, `estimated_duration`
  
- **`expenses`**: Expense records
  - Fields: `id`, `company_id`, `amount`, `category`, `description`, `expense_date`, `receipt_path`, `created_by`
  
- **`expense_items`**: Expense line items
  - Fields: `id`, `expense_id`, `description`, `amount`

#### Billing & Subscription Tables
- **`plan_catalog`**: Plan pricing catalog
  - Fields: `plan_code` (PK), `monthly_price`
  - Plans: `starter` ($39.99), `pro` ($59.99)
  
- **`plan_limits`**: Plan resource limits
  - Fields: `plan_code` (PK), `max_crew`, `max_customers`, `max_jobs_per_month`
  - Starter: 3 crew, 100 customers, 200 jobs/month
  - Pro: Unlimited (all NULL)
  
- **`stripe_event_ledger`**: Stripe webhook idempotency
  - Fields: `id`, `stripe_event_id` (UNIQUE), `event_type`, `processed_at`, `claimed_by`
  
- **`billing_subscription_history`**: Subscription change audit trail
  - Fields: `id`, `company_id`, `previous_status`, `new_status`, `previous_plan`, `new_plan`, `changed_at`, `changed_by`, `metadata`

#### Collections & Financial Tables
- **`collections_queue`**: Collections work queue
- **`collections_cases`**: Collections case management
- **`collections_followups`**: Follow-up tracking
- **`collections_escalations`**: Escalation records
- **`collections_communications`**: Communication log

#### Audit & Logging Tables
- **`product_events`**: Product telemetry events
  - Fields: `id`, `created_at`, `company_id`, `user_id`, `role`, `event_name`, `context` (jsonb)
  
- **`audit_log`**: Audit trail for sensitive operations
- **`customer_activity_log`**: Customer activity tracking
- **`overpayments_log`**: Overpayment attempt logging

#### Support & Platform Tables
- **`support_sessions`**: Platform admin support mode sessions
  - Fields: `id`, `platform_admin_id`, `target_company_id`, `started_at`, `ended_at`, `reason`, `metadata`

### RLS Policies
- **Multi-tenant isolation**: All tables have RLS enabled with `company_id` scoping
- **Role-based access**: Policies check `current_user_role()` and `current_company_id()`
- **Support mode**: Platform admin can access tenant data via `is_support_mode()` RPC
- **Read-only support mode**: Support mode mutations blocked via `support_mode_mutation_guardrails` migration

### Triggers
- **`handle_new_user()`**: Auto-creates `profiles` row on `auth.users` insert
  - Links crew members via `crew_member_id` metadata
  - Links customers via email fallback
  - Defensive error handling (warnings, not failures)
  
- **Plan limit enforcement triggers**:
  - `enforce_crew_plan_limit`: Blocks crew creation if limit exceeded
  - `enforce_customer_plan_limit`: Blocks customer creation if limit exceeded
  - `enforce_monthly_job_plan_limit`: Blocks job creation if monthly limit exceeded
  
- **Payment triggers**:
  - `set_payment_receipt_number`: Auto-generates receipt numbers
  - Invoice balance sync on payment insert
  
- **Invoice triggers**:
  - Auto-status updates (draft → sent → paid)
  - Due date computation
  - Overdue evaluation (cron job)

### RPC Functions

#### Core Business RPCs
- **`record_payment()`**: Record payment with overpayment protection
- **`void_payment()`**: Void payment (admin only)
- **`create_or_get_invoice_for_job()`**: Invoice creation/lookup
- **`send_invoice()`**: Send invoice email
- **`void_invoice()`**: Void invoice
- **`convert_quote_to_job()`**: Convert quote to job
- **`admin_convert_quote_to_job()`**: Admin quote conversion with scheduling
- **`generate_jobs_from_recurring()`**: Auto-generate jobs from recurring schedules
- **`generate_team_route_for_day()`**: Generate route for team/date
- **`get_team_route_for_day()`**: Retrieve route for team/date

#### Financial RPCs
- **`get_financial_snapshot()`**: Financial KPIs
- **`get_profit_snapshot()`**: Profit analysis
- **`get_profit_trends()`**: Profit trends over time
- **`get_revenue_report()`**: Revenue reporting
- **`get_ar_aging()`**: Accounts receivable aging
- **`get_cash_forecast()`**: Cash flow forecast
- **`get_collections_queue()`**: Collections work queue
- **`get_collections_cases()`**: Collections cases
- **`sync_collections_cases_from_escalations()`**: Auto-create cases from escalations
- **`log_collection_action_for_customer()`**: Log collection actions
- **`upsert_collection_followup()`**: Manage follow-ups

#### Plan & Billing RPCs
- **`get_company_plan_usage()`**: Get current usage vs limits
- **`claim_stripe_event()`**: Claim Stripe webhook event (idempotency)
- **`reconcile_company_billing()`**: Reconcile company billing with Stripe
- **`bootstrap_tenant_for_current_user()`**: Bootstrap new tenant
- **`expire_trials()`**: Expire trial subscriptions (cron)

#### Platform Admin RPCs
- **`get_platform_metrics()`**: Platform-wide metrics (MRR, companies, etc.)
- **`get_platform_companies()`**: List all companies
- **`get_platform_company_detail()`**: Company detail view
- **`get_platform_billing_diagnostics()`**: Billing diagnostics
- **`get_active_support_session()`**: Get active support session
- **`start_support_session()`**: Start support mode
- **`end_support_session()`**: End support mode
- **`is_support_mode()`**: Check if in support mode

#### Public RPCs (Rate-limited)
- **`get_quote_public()`**: Public quote viewing
- **`accept_quote_public()`**: Public quote acceptance
- **`reject_quote_public()`**: Public quote rejection
- **`request_job_schedule_public()`**: Public schedule request
- **`get_company_branding_public()`**: Public company branding

#### Telemetry RPCs
- **`log_product_event()`**: Log product event (SECURITY DEFINER)

---

## 3. BILLING SYSTEM

### Stripe Integration
- **Checkout**: `create-billing-checkout-session` edge function
- **Customer Portal**: `create-billing-portal-session` edge function
- **Webhooks**: `stripe-webhook` edge function handles all Stripe events

### Webhook Handlers
- **`customer.subscription.created`**: New subscription
- **`customer.subscription.updated`**: Subscription changes (plan, status)
- **`customer.subscription.deleted`**: Subscription cancellation
- **`checkout.session.completed`**: Checkout completion
- **`invoice.payment_succeeded`**: Payment success
- **`invoice.payment_failed`**: Payment failure

### Plan Catalog
- **Table**: `plan_catalog`
- **Plans**:
  - `starter`: $39.99/month (3 crew, 100 customers, 200 jobs/month)
  - `pro`: $59.99/month (unlimited)

### Plan Limits
- **Table**: `plan_limits`
- **Enforcement**: Database triggers on `crew_members`, `customers`, `jobs` inserts
- **Proactive UX**: `usePlanLimits` hook shows warnings before limits hit
- **Error Handling**: `handlePlanLimitError` utility shows upgrade CTAs

### Usage Tracking
- **RPC**: `get_company_plan_usage()` returns:
  - Current usage: `current_crew`, `current_customers`, `current_jobs_this_month`
  - Limits: `max_crew`, `max_customers`, `max_jobs_per_month`
  - Plan: `plan_code`

### Subscription Status
- **States**: `inactive`, `trialing`, `active`, `past_due`, `unpaid`, `canceled`
- **Trial Management**: `trial_ends_at` field, auto-expiration via cron
- **Grace Period**: `billing_grace_until` for past_due handling

### Billing Reliability
- **Idempotency**: `stripe_event_ledger` table with `claim_stripe_event()` RPC
- **Reconciliation**: `reconcile_company_billing()` RPC compares DB vs Stripe
- **History**: `billing_subscription_history` table tracks all changes
- **Diagnostics**: Platform admin can view billing diagnostics per company

---

## 4. AUTH SYSTEM

### Admin Login
- **Route**: `/login`
- **Component**: `Login.jsx`
- **Method**: `supabase.auth.signInWithPassword()`
- **Redirect**: Based on role (admin → `/admin`, crew → `/crew`, etc.)

### Crew Login
- **Route**: `/login` (same as admin)
- **Password Setup**: 
  - **Direct**: `create-crew-login` edge function (creates auth user + sets password)
  - **Invite**: `invite-user` edge function (sends magic link)
  - **Set Password**: `set-crew-password` edge function (updates existing password)
- **UI**: CrewAdmin page has "Create Login" and "Set Password" buttons

### Customer Login
- **Route**: `/customer/login`
- **Component**: `CustomerLogin.jsx`
- **Password Setup**:
  - **Direct**: `create-customer-login` edge function
  - **Invite**: `invite-user` edge function
  - **Set Password**: `set-customer-password` edge function
- **UI**: CustomersAdmin page has "Create Login" and "Set Password" buttons

### Password Setup Flows
1. **Create Login** (new user):
   - Admin creates crew/customer record
   - Admin clicks "Create Login"
   - Edge function creates `auth.users` record with password
   - Trigger creates `profiles` row and links `crew_members.user_id` or `customers.user_id`
   - User can immediately log in

2. **Set Password** (existing user):
   - User already has `auth.users` record
   - Admin clicks "Set Password"
   - Edge function updates password via `supabase.auth.admin.updateUserById()`
   - User can log in with new password

3. **Invite** (email-based):
   - Admin clicks "Invite"
   - Edge function sends magic link via `supabase.auth.admin.inviteUserByEmail()`
   - User clicks link, sets password on `/accept-invite` page
   - **Note**: Subject to email rate limits, direct password setup preferred

### Edge Functions (Auth)
- **`invite-user`**: Sends user invites (magic links)
  - Supports `crew`, `customer`, `admin`, `manager`, `dispatcher` roles
  - Includes `crew_member_id` or `customer_id` in metadata for trigger linking
  
- **`create-crew-login`**: Creates crew auth user with password
  - Includes `crew_member_id` in metadata for trigger linking
  
- **`set-crew-password`**: Sets/resets crew password
  
- **`create-customer-login`**: Creates customer auth user with password
  
- **`set-customer-password`**: Sets/resets customer password

### Auth Trigger
- **`handle_new_user()`**: Runs on `auth.users` insert
  - Creates `profiles` row
  - Links `crew_members.user_id` if `crew_member_id` in metadata
  - Links `customers.user_id` if `customer_id` in metadata
  - Falls back to email matching if metadata missing
  - Defensive error handling (warnings, not failures)

---

## 5. ADMIN PORTAL MODULES

### Core Operations
1. **Dashboard** (`/admin`)
   - KPIs: Jobs today/week, overdue, revenue, unpaid invoices
   - Financial overview
   - Crew workload visualization
   - Status breakdown charts

2. **Jobs** (`/admin/jobs`)
   - CRUD operations
   - Team assignment
   - Status management
   - Payment recording
   - Invoice generation
   - Photo management
   - Deep-linking: `?openJobId={id}&action={schedule|invoice|collect_payment}`

3. **Customers** (`/admin/customers`)
   - CRUD operations
   - Timeline view (jobs, quotes, invoices, payments)
   - KPI calculations
   - Activity logging
   - File attachments
   - Password setup (create login, set password)

4. **Crew** (`/admin/crew`)
   - Crew member management
   - Role assignment
   - Password setup (create login, set password, invite)
   - Performance tracking

5. **Teams** (`/admin/teams`)
   - Team creation and management
   - Crew-to-team assignments
   - Team-based job assignment

### Scheduling & Operations
6. **Operations Center** (`/admin/operations`) - **Phase B.1 Consolidation**
   - Tabs: Today, Schedule, Routes, Automation, Intelligence
   - Wraps: DispatchCenterAdmin, ScheduleAdmin, RoutePlanningAdmin, SchedulingCenterAdmin, JobIntelligenceAdmin

7. **Schedule Admin** (`/admin/schedule`)
   - Tabs: Needs Scheduling, Schedule Requests, Calendar
   - Job scheduling with date/time
   - Schedule request management

8. **Recurring Jobs** (`/admin/recurring-jobs`)
   - Recurring job templates
   - Recurrence types: Weekly, Biweekly, Monthly
   - Default team assignment
   - Pause/resume

9. **Scheduling Center** (`/admin/scheduling-center` → `/admin/operations?tab=automation`)
   - Operational view of recurring schedules
   - Generate scheduled jobs button
   - Generate today's draft routes button
   - Scheduling gaps detection

10. **Dispatch Center** (`/admin/dispatch-center` → `/admin/operations?tab=today`)
    - Today's operational overview
    - Unassigned jobs panel
    - Team assignment
    - Route status

11. **Route Planning** (`/admin/route-planning` → `/admin/operations?tab=routes`)
    - Route generation
    - Route optimization
    - Map visualization (Leaflet)
    - Route status clarity

12. **Job Intelligence** (`/admin/job-intelligence` → `/admin/operations?tab=intelligence`)
    - Operational insights
    - Unassigned upcoming jobs
    - Route mismatches
    - Missing addresses
    - Recurring schedule attention

### Finance
13. **Finance Hub** (`/admin/finance`) - **Phase B.1 Consolidation**
    - Tabs: Pipeline, Collections, Analytics, Intelligence
    - Wraps: RevenueHub, FinancialControlCenterAdmin

14. **Revenue Hub** (`/admin/revenue-hub` → `/admin/finance?tab=pipeline`)
    - Revenue pipeline
    - Invoice management
    - Collections workflow
    - Payment tracking

15. **Financial Control Center** (`/admin/financial-control-center` → `/admin/finance?tab=intelligence`)
    - Financial KPIs
    - Unpaid jobs
    - Partially paid jobs
    - Completed but unpaid
    - Payment risk alerts

16. **Payments** (`/admin/payments`)
    - Payment ledger view
    - Payment filtering
    - Void payments
    - Receipt management

17. **Expenses** (`/admin/expenses`)
    - Expense tracking
    - Receipt upload
    - Category management
    - Expense items

### Quotes
18. **Quotes** (`/admin/quotes`)
    - Quote list and management
    - Quote status tracking
    - Public quote links

19. **Quote Builder** (`/admin/quotes/new`)
    - Create quotes
    - PDF generation
    - Email sending

### Settings & Billing
20. **Settings** (`/admin/settings`)
    - Company branding (logo, colors)
    - Customer/crew label customization
    - Company information
    - **Support mode**: Read-only, mutations blocked

21. **Billing** (`/admin/billing`)
    - Subscription status
    - Plan information
    - Stripe customer/subscription IDs
    - Billing diagnostics
    - Reconcile billing button
    - Upgrade/downgrade CTAs
    - **Support mode**: Read-only, diagnostics visible, reconciliation allowed

### Onboarding
22. **Onboarding Wizard** (`/admin/onboarding`)
    - Company setup
    - Services configuration
    - First customer
    - First quote
    - Optional crew invitation
    - Completion tracked via `companies.setup_completed_at`

---

## 6. CREW PORTAL CAPABILITIES

### Routes
- **Dashboard**: `/crew` (CrewDashboard)
- **Jobs**: `/crew/jobs` (CrewPortalMobile)
- **Job Detail**: `/crew/job/:id` (CrewJobDetail)
- **Help**: `/crew/help` (CrewHelp)

### Features
- **Today's Route**: View route for assigned team with ordered stops
- **Route Access**: Via `get_team_route_for_day()` RPC (prefers published, falls back to draft)
- **Job List**: Filter by status (all, pending, completed)
- **Job Detail**: View job details, customer info, before/after photos
- **Payment Recording**: Record payments with overpayment protection
- **Google Maps Integration**: Route navigation
- **Real-time Updates**: Supabase subscriptions for job changes
- **Mobile Optimized**: `/crew/jobs` uses mobile-optimized interface

### Access Control
- **Role**: `crew` role required
- **Team Scoping**: Crew can only see jobs/routes for their assigned team
- **Payment Recording**: Crew can only record payments for jobs assigned to them

---

## 7. CUSTOMER PORTAL CAPABILITIES

### Routes
- **Dashboard**: `/customer/dashboard` (DashboardPage)
- **Jobs**: `/customer/jobs` (JobsListPage)
- **Job Detail**: `/customer/jobs/:id` (JobDetailPage)
- **Quotes**: `/customer/quotes` (QuotesListPage)
- **Quote Detail**: `/customer/quotes/:id` (QuoteDetailPage)
- **Invoices**: `/customer/invoices` (InvoicesListPage)
- **Invoice Detail**: `/customer/invoices/:id` (InvoiceDetailPage)
- **Schedule**: `/customer/schedule` (SchedulePage)
- **Profile**: `/customer/profile` (ProfilePage)
- **Login**: `/customer/login` (CustomerLogin)
- **Accept Invite**: `/customer/accept-invite` (CustomerAcceptInvite)

### Features
- **Job Viewing**: View assigned jobs, status, photos
- **Quote Viewing**: View quotes, accept/reject
- **Invoice Viewing**: View invoices, download PDFs
- **Schedule Requests**: Request job scheduling
- **Profile Management**: Update profile information
- **Activity Timeline**: View job/quote/invoice history
- **Public Quote Access**: View quotes via public link (no auth required)

### Access Control
- **Role**: `customer` role required
- **Customer Scoping**: Customers can only see their own data
- **Public Quotes**: Accessible via token-based public links

---

## 8. PLATFORM ADMIN FEATURES

### Routes
- **Dashboard**: `/platform` (PlatformDashboard)
- **Companies**: `/platform/companies` (PlatformCompanies)
- **Company Detail**: `/platform/company/:id` (PlatformCompanyDetail)

### Features
- **Multi-Company Management**: View all companies
- **Company Metrics**: View company KPIs, billing status
- **Support Mode**: Impersonate tenant admin interface
  - Read-only access to tenant data
  - Diagnostics and reconciliation allowed
  - Mutations blocked (except explicit diagnostic actions)
  - Session tracking via `support_sessions` table

### Access Control
- **Role**: `platform_admin` role required
- **Support Mode**: Access tenant admin interfaces via `start_support_session()` RPC
- **Read-Only**: Support mode mutations blocked via frontend and backend guards

---

## 9. EDGE FUNCTIONS LIST

### Billing Functions
1. **`create-billing-checkout-session`**
   - Creates Stripe checkout session
   - Returns checkout URL

2. **`create-billing-portal-session`**
   - Creates Stripe customer portal session
   - Returns portal URL

3. **`stripe-webhook`**
   - Handles all Stripe webhook events
   - Idempotent via `stripe_event_ledger`
   - Updates subscription status, plan, billing fields
   - Logs `checkout_completed` product event

4. **`reconcile-billing`**
   - Reconciles company billing with Stripe
   - Updates subscription status, plan, IDs
   - Appends billing history

### Auth Functions
5. **`invite-user`**
   - Sends user invites (magic links)
   - Supports all roles
   - Includes `crew_member_id`/`customer_id` in metadata

6. **`create-crew-login`**
   - Creates crew auth user with password
   - Includes `crew_member_id` in metadata

7. **`set-crew-password`**
   - Sets/resets crew password

8. **`create-customer-login`**
   - Creates customer auth user with password

9. **`set-customer-password`**
   - Sets/resets customer password

### Business Functions
10. **`auto-generate-recurring-jobs`**
    - Automated job generation from recurring schedules
    - Cron-triggered

11. **`send-quote-emails`**
    - Sends quote emails to customers

12. **`signed-invoice-url`**
    - Generates signed URLs for invoice PDFs
    - Time-limited access

13. **`extract-expense-receipt`**
    - OCR extraction from expense receipts (if implemented)

---

## 10. KNOWN INCOMPLETE SYSTEMS

### Partially Implemented
1. **Route Publishing Workflow**
   - Routes can be generated (draft) and published
   - Crew can access published routes
   - **Missing**: Full publish lifecycle UI, draft/published state management UI

2. **Collections Workflow**
   - Collections queue, cases, follow-ups, escalations implemented
   - **Missing**: Full UI workflow, automated escalation triggers

3. **Expense Receipt OCR**
   - `extract-expense-receipt` function exists
   - **Status**: Unknown if fully implemented/tested

4. **Demo Mode**
   - `demo-mode.js` utility exists
   - `seed_demo_data` and `purge_demo_data` RPCs exist
   - **Status**: Unknown if fully integrated into UI

### Known Limitations
1. **Email Rate Limits**
   - Invite flow subject to Supabase Auth email rate limits
   - **Workaround**: Direct password setup (`create-crew-login`, `create-customer-login`)

2. **Route Optimization**
   - Basic route generation exists
   - **Missing**: Advanced optimization algorithms, multi-stop optimization

3. **Job Intelligence**
   - Rule-based insights implemented
   - **Missing**: AI-powered insights (job descriptions, estimates, risk detection)

4. **Financial Forecasting**
   - Cash forecast RPC exists
   - **Missing**: UI visualization, trend analysis

5. **Performance Monitoring**
   - Sentry integration exists
   - **Missing**: Performance metrics, query optimization monitoring

### Future Enhancements (Not Started)
1. **AI Integration**
   - Job description generation
   - Estimate generation
   - Job risk detection
   - Customer communication automation

2. **Advanced Reporting**
   - Custom report builder
   - Scheduled reports
   - Export to Excel/PDF

3. **Mobile Apps**
   - Native iOS/Android apps
   - Offline support
   - Push notifications

4. **Integrations**
   - QuickBooks integration
   - Accounting software sync
   - Calendar integrations (Google Calendar, Outlook)

---

## SUMMARY

**ServiceOps SaaS** is a comprehensive multi-tenant service operations management platform built with React and Supabase. The application supports lawn care, landscaping, and similar service businesses with full lifecycle management from quotes to payments.

**Key Strengths**:
- ✅ Multi-tenant isolation hardened
- ✅ Role-based access control consistent
- ✅ Billing system with Stripe integration
- ✅ Comprehensive admin, crew, and customer portals
- ✅ Support mode for platform admin
- ✅ Telemetry foundation in place
- ✅ Launch-ready after QA

**Architecture Highlights**:
- Frontend: React 19 + Vite + Tailwind CSS
- Backend: Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- Multi-tenancy: Company-scoped data with RLS
- Billing: Stripe integration with plan limits and usage tracking
- Auth: Role-based with direct password setup and invite flows

**Current State**: Functionally complete, architecturally sound, ready for comprehensive QA before launch.
