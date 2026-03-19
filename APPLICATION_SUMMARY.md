# Service Operations SaaS - Application Summary

## Overview
A comprehensive multi-tenant service operations management platform built with React and Supabase. The application supports lawn care, landscaping, and similar service businesses with full lifecycle management from quotes to payments.

---

## Architecture

### Technology Stack
- **Frontend**: React with React Router
- **Backend**: Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- **Authentication**: Supabase Auth with role-based access control
- **Multi-tenancy**: Company-scoped data with RLS (Row Level Security)
- **Error Tracking**: Sentry integration
- **Styling**: Tailwind CSS with custom components

### Key Design Principles
- Multi-tenant safety (all queries scoped by `company_id`)
- Role-based access control (admin, manager, dispatcher, crew, customer, platform_admin)
- Timezone-safe date handling (local date components, no UTC conversion issues)
- Read-only intelligence pages (no data mutations)
- Actionable insights with safe navigation patterns

---

## User Roles & Portals

### 1. Admin Portal (`/admin`)
**Access**: Admin, Manager, Dispatcher roles

**Primary Dashboard**: `/admin`
- KPIs: Jobs today, jobs this week, overdue jobs, revenue, unpaid invoices
- Financial overview: Revenue this month, payments received, expenses, outstanding balances
- Crew workload visualization
- Status breakdown charts
- Overdue jobs tracking

### 2. Crew/Worker Portal (`/crew`)
**Access**: Crew role, Admin (can view)

**Features**:
- Today's route view with Google Maps integration
- Job list with filtering (all, pending, completed)
- Job detail view with before/after photos
- Payment collection (with overpayment protection)
- Earnings tracking
- Mobile-optimized interface (`/crew/mobile`)

### 3. Customer Portal (`/customer`)
**Access**: Customer role

**Features**:
- Dashboard with job overview
- Jobs list and detail pages
- Quotes list and detail pages
- Invoices list and detail pages
- Schedule request functionality
- Profile management
- Customer feedback submission

### 4. Platform Admin Portal (`/platform`)
**Access**: Platform Admin role

**Features**:
- Multi-company management
- Company detail views
- Support mode (can view tenant admin interfaces)

### 5. Public Pages
**Access**: Unauthenticated

- Public quote viewing (`/quote/:id`)
- Public quote receipt (`/quote/:id/receipt`)
- Public job schedule request (`/schedule/:token`)

---

## Admin Pages & Functions

### Core Operations

#### **Jobs Admin** (`/admin/jobs`)
**Functions**:
- Create, edit, delete jobs
- Assign jobs to teams
- Update job status (Pending, Scheduled, Completed, Canceled)
- Add before/after photos
- Generate invoices (PDF)
- Record payments
- Filter by status, date, team, customer
- View payment history per job
- Export jobs to CSV
- Deep-linking support: `?openJobId={id}&action={schedule|invoice|collect_payment}`

#### **Customers Admin** (`/admin/customers`)
**Functions**:
- Create, edit, delete customers
- View customer timeline (jobs, quotes, invoices, payments)
- Customer KPIs (total jobs, revenue, last activity)
- Customer feedback management
- Address management
- Contact information (phone, email)

#### **Crew/Workers Admin** (`/admin/crew`)
**Functions**:
- Manage crew members
- Assign roles and permissions
- View crew assignments
- Track crew performance

#### **Teams Admin** (`/admin/teams`)
**Functions**:
- Create and manage teams
- Assign crew members to teams
- Team-based job assignment
- Single-person teams (display as worker name) vs multi-person teams

---

### Scheduling & Operations

#### **Schedule Admin** (`/admin/schedule`)
**Functions**:
- Centralized scheduling interface
- Tabs: Needs Scheduling, Schedule Requests, Calendar View
- Job scheduling with date/time assignment
- Schedule request management
- Calendar integration

#### **Recurring Jobs Admin** (`/admin/recurring-jobs`)
**Functions**:
- Create recurring job templates
- Recurrence types: Weekly, Biweekly, Monthly
- Set default team assignment
- Pause/resume recurring schedules
- View last generated date
- Auto-assign default team to generated jobs

#### **Scheduling Center** (`/admin/scheduling-center`)
**Functions**:
- Operational view of recurring schedules
- Upcoming recurring work (next 7 days)
- Next 7 days scheduled jobs overview
- Scheduling gaps detection
- Schedule health summary (active recurring, scheduled jobs, unassigned)
- **Generate Scheduled Jobs** button: Calls `generate_jobs_from_recurring()` RPC
- **Generate Today's Draft Routes** button: Creates routes for teams with assigned jobs today
- Today's teams requiring routes summary

#### **Dispatch Center** (`/admin/dispatch-center`)
**Functions**:
- Today's operational overview
- Today's jobs summary (Total, Completed, Pending)
- Crew load per team (assigned jobs count)
- Unassigned jobs list with team assignment dropdown
- Route status per team (route exists, stop count)
- Dispatch warnings:
  - Overdue jobs
  - Jobs assigned but no route
  - Route stop mismatches
  - Idle teams
  - Overloaded teams

#### **Route Planning** (`/admin/route-planning`)
**Functions**:
- Generate routes for specific team and date
- View route stops with job details
- Optimize route order
- Route run management
- Integration with Google Maps

---

### Financial Management

#### **Payments Admin** (`/admin/payments`)
**Functions**:
- View all payments
- Payment ledger management
- Filter by date, customer, job
- Payment method tracking
- Receipt number management
- Void payment functionality

#### **Expenses Admin** (`/admin/expenses`)
**Functions**:
- Track business expenses
- Categorize expenses
- Expense reporting
- Financial tracking

#### **Revenue Hub** (`/admin/revenue-hub`)
**Functions**:
- Comprehensive revenue pipeline view
- Quote-to-job conversion tracking
- Job stage management (Needs Scheduling → Scheduled → Completed → Invoiced → Paid)
- Collections queue management
- Collections activity tracking
- Collections follow-ups and escalations
- AR aging reports
- Cash flow forecasting
- Revenue trends and analytics
- Revenue by customer
- Revenue by month
- Collections communication templates
- Collections cases management
- Next action recommendations

#### **Financial Control Center** (`/admin/financial-control-center`)
**Functions**:
- **KPI Summary**:
  - Revenue collected this month
  - Unpaid jobs count
  - Partially paid jobs count
  - Completed but unpaid jobs count
- **Unpaid Jobs**: Jobs with no payments recorded
- **Partially Paid Jobs**: Jobs with partial payments
- **Completed But Unpaid**: Completed jobs with remaining balance
- **Payment Risk / Attention**:
  - High-balance unpaid jobs (>$500)
  - Completed jobs with no payment
  - Customers with multiple unpaid jobs (3+)
- Actionable navigation to Jobs page and Revenue Hub

---

### Quotes & Invoicing

#### **Quotes Admin** (`/admin/quotes`)
**Functions**:
- Create, edit, send quotes
- Quote status management (Draft, Sent, Accepted, Rejected, Expired)
- Convert quotes to jobs
- Quote templates
- Public quote links

#### **Quote Builder** (`/admin/quotes/new`, `/admin/quotes/:id`)
**Functions**:
- Visual quote builder
- Service line items
- Pricing calculations
- PDF generation
- Email sending

---

### Intelligence & Analytics

#### **Job Intelligence** (`/admin/job-intelligence`)
**Functions**:
- **KPI Summary**: Total insights, unassigned upcoming, address issues, route mismatches
- **Unassigned Upcoming Jobs**: Jobs in next 7 days with no team assigned
  - Action: Team assignment dropdown (direct assignment)
- **Jobs Assigned But Not Routed Today**: Teams with assigned jobs but no route
  - Action: Link to Route Planning
- **Route Mismatch**: Assigned jobs count ≠ route stops count
- **Missing Customer Address**: Jobs with blank customer addresses
  - Action: Link to Customers page
- **Recurring Schedule Attention**: Active schedules with no upcoming generated job
  - Action: Link to Scheduling Center
- **Incomplete Operational Data**: Jobs missing required fields
  - Action: Link to Jobs page

#### **Admin Dashboard** (`/admin`)
**Functions**:
- High-level KPIs
- Financial snapshot
- Crew workload overview
- Status breakdown
- Overdue jobs tracking
- Quick navigation cards

---

### Settings & Configuration

#### **Settings** (`/admin/settings`)
**Functions**:
- Company profile management
- Branding customization (logo, colors, labels)
- Email templates
- Notification settings
- Timezone configuration
- Business address
- Customer/crew label customization

#### **Billing Admin** (`/admin/billing`)
**Functions**:
- **Subscription Status Display**:
  - Current plan (Starter/Pro)
  - Subscription status (inactive, trialing, active, past_due, canceled, unpaid)
  - Trial end date
  - Billing grace period end date
  - Last billing sync timestamp
- **Usage & Limits Dashboard**:
  - Crew members: Current count / Max limit
  - Customers: Current count / Max limit
  - Jobs this month: Current count / Max limit per month
  - Real-time usage tracking via `get_company_plan_usage()` RPC
- **Stripe Integration**:
  - **Start Checkout**: Creates Stripe Checkout session for subscription
    - Plan selection (Starter or Pro)
    - Redirects to Stripe hosted checkout
    - Creates or updates Stripe customer
    - Links subscription to company
  - **Open Billing Portal**: Access Stripe Customer Portal
    - Update payment methods
    - View invoices
    - Update billing information
    - Cancel subscription
    - Available for: active, trialing, past_due, unpaid, canceled statuses
- **Plan Selection**:
  - Choose between Starter and Pro plans
  - Plan selection persists through checkout flow
- **Support Mode Protection**: Billing actions disabled in support mode

#### **Onboarding Wizard** (`/admin/onboarding`)
**Functions**:
- New company setup
- Initial configuration
- Guided setup process

---

## Backend Functions (RPCs)

### Job Generation
- **`generate_jobs_from_recurring()`**: Automatically generates jobs from recurring schedules
  - Generates at most one job per recurring schedule per call
  - Respects `last_generated_date` and `recurrence_type`
  - Prevents duplicate job creation
  - Multi-tenant safe with role-based access

### Route Generation
- **`generate_team_route_for_day(service_date, team_id)`**: Creates route for a team on a specific date
  - Generates route runs and route stops
  - Optimizes stop order
  - Links jobs to route stops

### Payment Processing
- **`record_payment(job_id, amount, method, notes, external_ref)`**: Records payment with overpayment protection
  - Checks for overpayments
  - Logs overpayment attempts to `overpayments_log`
  - Updates job payment totals
  - Returns payment details and balance information

---

## Key Features

### Multi-Tenancy
- All data scoped by `company_id`
- Row Level Security (RLS) policies
- Support mode for platform admins
- Company-specific branding and labels

### Team Management
- Team-based job assignment
- Single-person teams (display as worker name)
- Multi-person teams
- Team workload tracking
- Route generation per team

### Recurring Job Automation
- Weekly, biweekly, monthly recurrence
- Automatic job generation from templates
- Default team assignment
- Pause/resume functionality
- Last generated date tracking

### Route Optimization
- Team-based route generation
- Stop order optimization
- Google Maps integration
- Route run management
- Route stop tracking

### Payment Management
- Payment ledger system
- Overpayment protection
- Multiple payment methods
- Receipt number generation
- Payment history tracking
- Balance calculations

### Collections Management
- Collections queue
- Follow-up scheduling
- Escalation management
- Communication templates
- Collections cases
- AR aging reports

### Intelligence & Insights
- Rule-based insights (no AI dependencies)
- Operational risk detection
- Financial risk signals
- Actionable recommendations
- KPI dashboards

---

## Data Models

### Core Entities
- **Companies**: Multi-tenant organization
- **Profiles**: User accounts with role and company association
- **Customers**: Service recipients
- **Jobs**: Service work orders
- **Recurring Jobs**: Job templates with recurrence rules
- **Teams**: Crew groupings
- **Crew Members**: Individual workers
- **Team Members**: Crew-to-team associations
- **Payments**: Payment records linked to jobs
- **Quotes**: Service proposals
- **Invoices**: Billing documents
- **Route Runs**: Route instances for a team/date
- **Route Stops**: Individual stops within a route
- **Expenses**: Business expense tracking
- **Customer Feedback**: Job completion feedback

### Relationships
- Jobs → Customers (many-to-one)
- Jobs → Teams (many-to-one via `assigned_team_id`)
- Jobs → Recurring Jobs (many-to-one)
- Jobs → Payments (one-to-many)
- Teams → Team Members (one-to-many)
- Team Members → Crew Members (many-to-one)
- Route Runs → Teams (many-to-one)
- Route Runs → Route Stops (one-to-many)
- Route Stops → Jobs (many-to-one)

---

## Security & Access Control

### Role-Based Access
- **Admin**: Full access to all admin features
- **Manager**: Revenue Hub access
- **Dispatcher**: Dispatch Center, Scheduling Center, Route Planning, Job Intelligence, Financial Control Center
- **Crew**: Worker portal only
- **Customer**: Customer portal only
- **Platform Admin**: Multi-company management

### Authentication
- Supabase Auth with email/password
- Password reset functionality
- Customer invite acceptance
- Company bootstrap for new organizations

### Data Protection
- All queries scoped by `company_id`
- RLS policies enforce tenant isolation
- Role-based route protection
- Support mode for platform admins (temporary company access)

---

## Integration Points

### External Services
- **Stripe**: Payment processing and subscription management
- **Google Maps**: Route visualization and navigation
- **Sentry**: Error tracking and monitoring
- **Email**: Quote/invoice sending (via Supabase)

### File Storage
- Before/after job photos (Supabase Storage)
- Invoice PDFs (Supabase Storage)
- Quote PDFs (Supabase Storage)

---

## Date Handling

### Timezone Safety
- All date filtering uses local date components (`getFullYear()`, `getMonth()`, `getDate()`)
- No `toISOString()` for date-only comparisons
- Consistent `getTodayDate()` helper across pages
- Safe date arithmetic for next N days calculations

---

## Navigation Patterns

### Deep Linking
- Jobs: `/admin/jobs?openJobId={id}&action={schedule|invoice|collect_payment}`
- Quotes: `/admin/quotes?openQuoteId={id}`
- Schedule: `/admin/schedule?tab={needs-scheduling|requests}&jobId={id}`

### Query Parameters
- Filter states preserved in URL
- Tab navigation via query params
- Action pre-filling (e.g., open job with payment collection)

---

## Key Workflows

### Job Lifecycle
1. **Quote Created** → Quote sent to customer
2. **Quote Accepted** → Converted to job
3. **Job Scheduled** → Assigned to team, service date set
4. **Job Completed** → Status updated, photos added
5. **Invoice Generated** → PDF created and sent
6. **Payment Recorded** → Payment added to ledger
7. **Job Paid** → Balance zero, job closed

### Recurring Job Workflow
1. **Recurring Template Created** → Set recurrence type, default team
2. **Jobs Auto-Generated** → Via `generate_jobs_from_recurring()` RPC
3. **Jobs Assigned** → Default team assigned automatically
4. **Routes Generated** → Via "Generate Today's Draft Routes" in Scheduling Center
5. **Service Performed** → Job completed and paid
6. **Next Job Generated** → Cycle repeats

### Collections Workflow
1. **Unpaid Job Detected** → Financial Control Center or Revenue Hub
2. **Collections Case Created** → In Revenue Hub
3. **Follow-up Scheduled** → Communication planned
4. **Payment Collected** → Via Jobs page or Revenue Hub
5. **Case Closed** → Balance resolved

---

## Billing & Subscription System

### Plan Tiers

#### **Starter Plan**
- **Monthly Price**: $39.99
- **Crew Limit**: 3 crew members
- **Customer Limit**: 100 customers
- **Jobs Limit**: 200 jobs per month
- **Features**: All core features with resource limits

#### **Pro Plan**
- **Monthly Price**: $59.99
- **Crew Limit**: Unlimited (NULL = no restriction)
- **Customer Limit**: Unlimited (NULL = no restriction)
- **Jobs Limit**: Unlimited (NULL = no restriction)
- **Features**: All features with unlimited resources

### Subscription Statuses
- **inactive**: No active subscription
- **trialing**: In trial period
- **active**: Active paid subscription
- **past_due**: Payment failed, grace period active
- **unpaid**: Payment failed, no grace period
- **canceled**: Subscription canceled

### Billing Infrastructure

#### **Database Schema**
- **`companies` table billing fields**:
  - `stripe_customer_id`: Stripe customer identifier
  - `stripe_subscription_id`: Stripe subscription identifier
  - `subscription_status`: Current subscription state
  - `plan`: Plan tier (starter/pro)
  - `trial_ends_at`: Trial expiration timestamp
  - `billing_grace_until`: Grace period end for past_due subscriptions
  - `billing_updated_at`: Last billing sync timestamp

- **`plan_limits` table**:
  - Defines resource limits per plan
  - `plan_code`: Plan identifier (starter/pro)
  - `max_crew`: Maximum crew members (NULL = unlimited)
  - `max_customers`: Maximum customers (NULL = unlimited)
  - `max_jobs_per_month`: Maximum jobs per month (NULL = unlimited)
  - Enforced by CHECK constraints (non-negative when set)

- **`plan_catalog` table**:
  - Single source of truth for plan pricing
  - Used for MRR (Monthly Recurring Revenue) calculations
  - `plan_code`: Plan identifier
  - `monthly_price`: Monthly subscription price

- **`billing_subscription_history` table**:
  - Audit trail of billing changes
  - Tracks: plan changes, status changes, Stripe ID updates
  - Fields: `company_id`, `field_name`, `old_value`, `new_value`, `changed_at`

#### **Database Functions (RPCs)**

**`get_company_plan_usage(p_company_id)`**:
- Returns current plan limits and usage snapshot
- Returns:
  - `plan_code`: Current plan
  - `max_crew`, `max_customers`, `max_jobs_per_month`: Plan limits
  - `current_crew`: Current crew member count
  - `current_customers`: Current customer count
  - `current_jobs_this_month`: Jobs created this calendar month
- Used by billing UI and limit enforcement triggers

#### **Limit Enforcement Triggers**

**Crew Limit Enforcement** (`enforce_crew_plan_limit`):
- Trigger: `BEFORE INSERT` on `crew_members`
- Checks: `current_crew >= max_crew`
- Error: `CREW_LIMIT_REACHED: {plan} plan allows up to {max} crew members. Upgrade to Pro to add more crew members.`
- Bypass: If `max_crew IS NULL` (unlimited)

**Customer Limit Enforcement** (`enforce_customer_plan_limit`):
- Trigger: `BEFORE INSERT` on `customers`
- Checks: `current_customers >= max_customers`
- Error: `CUSTOMER_LIMIT_REACHED: {plan} plan allows up to {max} customers. Upgrade to Pro to add more customers.`
- Bypass: If `max_customers IS NULL` (unlimited)

**Monthly Job Limit Enforcement** (`enforce_monthly_job_plan_limit`):
- Trigger: `BEFORE INSERT` on `jobs`
- Checks: `current_jobs_this_month >= max_jobs_per_month`
- Error: `JOB_LIMIT_REACHED: {plan} plan allows up to {max} jobs per month. Upgrade to Pro to create more jobs.`
- Bypass: If `max_jobs_per_month IS NULL` (unlimited)
- Counts: Jobs created in current calendar month (`date_trunc('month', now())`)

### Stripe Integration

#### **Edge Functions**

**`create-billing-checkout-session`**:
- Creates Stripe Checkout session for subscription
- Plan selection: Request body > Company plan > Default (starter)
- Stripe Price IDs: `STRIPE_STARTER_PRICE_ID`, `STRIPE_PRO_PRICE_ID`
- Creates Stripe customer if missing
- Returns checkout URL for redirect
- Updates company with selected plan before checkout

**`create-billing-portal-session`**:
- Creates Stripe Customer Portal session
- Requires existing Stripe customer
- Returns portal URL for redirect
- Allows customers to manage subscription, payment methods, invoices

**`stripe-webhook`**:
- Handles Stripe webhook events
- **Event Types Handled**:
  - `customer.subscription.created`: New subscription
  - `customer.subscription.updated`: Plan/status changes
  - `customer.subscription.deleted`: Subscription canceled
  - `invoice.payment_succeeded`: Successful payment
  - `invoice.payment_failed`: Failed payment
- **Status Mapping**:
  - Stripe status → App status conversion
  - Grace period calculation for past_due
  - Plan resolution from subscription metadata or price lookup_key
- **Updates**:
  - Company subscription status
  - Plan tier
  - Stripe customer/subscription IDs
  - Trial end dates
  - Billing grace periods
  - Billing sync timestamp

### Usage Tracking

#### **Real-Time Usage Metrics**
- **Crew Members**: Count of `crew_members` where `company_id` matches
- **Customers**: Count of `customers` where `company_id` matches
- **Jobs This Month**: Count of `jobs` created in current calendar month
  - Uses `date_trunc('month', now())` for month boundary
  - Includes all jobs regardless of status

#### **Usage Display**
- Shown in Billing Admin page (`/admin/billing`)
- Format: `{current} / {max}` or `{current} / Unlimited`
- Updates in real-time via `get_company_plan_usage()` RPC
- Loading states during fetch

### Billing Workflows

#### **New Subscription**
1. User selects plan (Starter/Pro) in Billing Admin
2. Clicks "Start Checkout"
3. `create-billing-checkout-session` creates Stripe Checkout
4. User completes payment on Stripe hosted page
5. Stripe webhook `customer.subscription.created` fires
6. `stripe-webhook` updates company:
   - `subscription_status` = "active" or "trialing"
   - `plan` = selected plan
   - `stripe_customer_id` = Stripe customer ID
   - `stripe_subscription_id` = Stripe subscription ID
7. User redirected back to app

#### **Plan Upgrade/Downgrade**
1. User opens Billing Portal
2. Changes subscription in Stripe
3. Stripe webhook `customer.subscription.updated` fires
4. `stripe-webhook` updates company plan
5. Limit enforcement triggers apply new limits immediately
6. Existing resources remain, new resources subject to new limits

#### **Payment Failure**
1. Stripe attempts payment
2. Payment fails
3. Stripe webhook `invoice.payment_failed` fires
4. `stripe-webhook` sets:
   - `subscription_status` = "past_due"
   - `billing_grace_until` = now + grace period days
5. User can update payment method in Billing Portal
6. On successful retry: `subscription_status` = "active"

#### **Subscription Cancellation**
1. User cancels in Stripe Customer Portal
2. Stripe webhook `customer.subscription.deleted` fires
3. `stripe-webhook` sets:
   - `subscription_status` = "canceled"
   - Subscription remains active until period end
4. Limits remain until subscription period ends

### Platform Admin Billing Metrics

#### **MRR Calculation**
- Uses `plan_catalog` table for pricing
- Formula: `SUM(plan_catalog.monthly_price)` for all companies with `subscription_status = 'active'`
- Excludes: trialing, past_due, canceled, inactive subscriptions
- Available via `get_platform_metrics()` RPC (platform_admin only)

#### **Subscription Metrics**
- Total companies
- Active subscriptions count
- Trialing subscriptions count
- Past due / unpaid count
- Inactive / canceled count
- Total MRR

### Security & Access Control

#### **Billing Actions**
- **Admin Only**: Billing Admin page requires admin role
- **Support Mode**: Billing actions disabled when platform admin in support mode
- **Stripe Webhooks**: Verified via signature validation
- **RLS Policies**: Plan limits table readable by authenticated users (not sensitive)

#### **Limit Enforcement**
- **Database-Level**: Triggers enforce limits at INSERT time
- **Multi-Tenant Safe**: All checks scoped by `company_id`
- **Error Messages**: User-friendly messages with upgrade prompts
- **Graceful Degradation**: Unlimited plans (NULL limits) bypass checks

### Trial Periods

#### **Trial Management**
- `trial_ends_at`: Timestamp when trial expires
- Trial status: `subscription_status = 'trialing'`
- Trial conversion: Automatically converts to `active` on successful payment
- Trial expiration: Converts to `inactive` if no payment

### Billing Grace Periods

#### **Grace Period Logic**
- **Past Due Status**: `subscription_status = 'past_due'`
- **Grace Period**: `billing_grace_until` timestamp
- **Purpose**: Allow time to update payment method before service interruption
- **Calculation**: Set when payment fails (configurable days)
- **Expiration**: After grace period, status may change to `unpaid`

---

## File Structure

```
src/
├── pages/
│   ├── admin/          # Admin portal pages
│   ├── crew/           # Crew portal pages
│   ├── customer/       # Customer portal pages
│   ├── platform/       # Platform admin pages
│   ├── public/         # Public-facing pages
│   └── auth/           # Authentication pages
├── components/
│   ├── ui/             # Reusable UI components
│   ├── nav/            # Navigation components
│   ├── revenue/        # Revenue pipeline components
│   └── collections/    # Collections workflow components
├── layouts/            # Layout wrappers
├── context/            # React context providers
├── utils/              # Utility functions
├── lib/                # Library code
└── hooks/              # Custom React hooks

supabase/
├── migrations/         # Database migrations
└── functions/          # Edge functions
```

---

## Summary Statistics

### Total Pages
- **Admin Pages**: 20+
- **Crew Pages**: 4
- **Customer Pages**: 9
- **Platform Pages**: 3
- **Public Pages**: 3
- **Auth Pages**: 4

### Key Features
- Multi-tenant SaaS architecture
- Role-based access control (6 roles)
- Job lifecycle management
- Recurring job automation
- Route planning and optimization
- Financial management and collections
- Quote-to-job conversion
- Payment processing with overpayment protection
- Intelligence and analytics dashboards
- Mobile-responsive design
- **Stripe-powered subscription billing with plan limits**
- **Database-enforced resource limits**
- **Real-time usage tracking**

---

This application provides a complete service operations management solution with comprehensive features for managing jobs, customers, teams, finances, and operations in a multi-tenant SaaS environment with full subscription billing and usage-based limits.
