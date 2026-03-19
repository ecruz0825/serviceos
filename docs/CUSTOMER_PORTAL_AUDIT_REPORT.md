# Customer Portal Audit Report
**Date:** 2024-02-06  
**Scope:** Complete analysis of Customer Portal functionality, architecture, and gaps

---

## EXECUTIVE SUMMARY

The Customer Portal is a **minimal, single-page implementation** (`CustomerPortal.jsx`) that provides basic job history viewing, payment tracking, feedback submission, and invoice access. It lacks modern UI/UX patterns, proper navigation, quote management, scheduling capabilities, and comprehensive branding integration.

**Current State:** Functional but basic  
**Recommended Action:** Complete redesign using shadcn UI with modern card-based layout and full navigation

---

## A) ROUTE STRUCTURE AUDIT

### Current Routes

| Route | Component | Protection | Status |
|-------|-----------|------------|--------|
| `/customer` | `CustomerPortal.jsx` | `ProtectedRoute` (role: `customer`) | ✅ Active |

### Route Configuration
- **Location:** `src/App.jsx` (lines 261-267)
- **Protection:** Uses `ProtectedRoute` with `allowedRoles={['customer']}`
- **Navigation:** No dedicated customer navigation; uses shared `Navbar.jsx` (which shows minimal customer-specific links)
- **Layout:** No dedicated customer layout wrapper (unlike Admin's `AppShell` or Crew's `CrewLayout`)

### Issues Identified
1. ❌ **Single route only** - No sub-routes for quotes, invoices, profile, etc.
2. ❌ **No navigation structure** - Customers cannot navigate between different sections
3. ❌ **No layout wrapper** - Missing consistent header/footer/sidebar for customer experience
4. ❌ **No deep linking** - Cannot link directly to specific jobs, quotes, or invoices

### Recommended Route Structure
```
/customer
  ├── /customer/dashboard (default)
  ├── /customer/jobs
  │   └── /customer/jobs/:id
  ├── /customer/quotes
  │   └── /customer/quotes/:id
  ├── /customer/invoices
  │   └── /customer/invoices/:id
  ├── /customer/payments
  ├── /customer/schedule
  └── /customer/profile
```

---

## B) UI COMPONENT AUDIT

### Current Components Used

| Component | Location | Usage | Status |
|-----------|----------|-------|--------|
| `Button` | `src/components/ui/Button.jsx` | View/Download Invoice buttons | ✅ Uses CSS vars (brand-aware) |
| `FeedbackForm` | `src/components/FeedbackForm.jsx` | Submit job feedback | ✅ Functional |
| `Card` | `src/components/ui/Card.jsx` | Not used | ❌ Missing |
| `PageHeader` | `src/components/ui/PageHeader.jsx` | Not used | ❌ Missing |
| `Navbar` | `src/Navbar.jsx` | Shared navigation | ⚠️ Minimal customer support |

### UI Patterns

**Current Implementation:**
- Uses **HTML table** (`<table>`) for job listing (lines 209-339)
- Hard-coded Tailwind classes (`bg-gray-50`, `text-gray-800`, `bg-gray-200`)
- No card-based layout
- No responsive design considerations
- No empty states beyond "No jobs found"
- No loading skeletons
- No pagination or filtering

**Issues:**
1. ❌ **Hard-coded colors** - Uses `gray-*`, `blue-700` instead of brand CSS variables
2. ❌ **No responsive design** - Table will break on mobile
3. ❌ **No component reuse** - Duplicates logic that exists in Admin pages
4. ❌ **No empty states** - Minimal error/empty handling
5. ❌ **No loading states** - Only shows "Loading..." text
6. ❌ **No pagination** - All jobs loaded at once

### Components Missing
- Job card component (reusable)
- Quote card component
- Invoice card component
- Payment history component
- Status badges (with brand colors)
- Empty state components
- Loading skeleton components
- Filter/search components
- Pagination component

---

## C) DATA FLOW AUDIT

### Data Loading

**Current Flow:**
1. `loadCustomerJobs()` (lines 23-188)
   - Fetches user via `supabase.auth.getUser()`
   - Looks up customer record via `customers.user_id`
   - Fetches jobs via direct Supabase query (no RPC)
   - Fetches payments via direct Supabase query
   - Fetches profiles for `received_by` UUIDs
   - Fetches customer feedback
   - Calculates totals client-side

**Data Sources:**
- `customers` table (via `user_id`)
- `jobs` table (via `customer_id`)
- `payments` table (via `job_id`)
- `profiles` table (for `received_by` names)
- `customer_feedback` table (for ratings/comments)

### RPC Usage
- ❌ **No RPCs used** - All data fetched via direct Supabase queries
- ⚠️ **No optimized queries** - Multiple separate queries instead of joins
- ⚠️ **Client-side calculations** - Totals computed in JavaScript

### Data Exposed

**Jobs Query (lines 45-60):**
```javascript
.select(`
  id,
  services_performed,
  status,
  job_cost,
  notes,
  service_date,
  before_image,
  after_image,
  invoice_path,
  customers(full_name, email)
`)
```

**Security Concerns:**
- ✅ **RLS enforced** - Jobs filtered by `customer_id` (via RLS policy)
- ⚠️ **Fields exposed** - `before_image`, `after_image` selected but **never displayed** in UI
- ⚠️ **No invoice table access** - Only uses `jobs.invoice_path`, not `invoices` table

### Missing Data
- ❌ **Quotes** - No quote data loaded or displayed
- ❌ **Invoices table** - Only uses legacy `jobs.invoice_path`
- ❌ **Schedule requests** - No schedule request status shown
- ❌ **Customer profile** - No customer details displayed
- ❌ **Company branding** - Not loaded (should use `BrandContext`)

---

## D) RPC + BACKEND DEPENDENCY AUDIT

### RPCs Available (Not Used)

| RPC | Purpose | Customer Access | Status |
|-----|---------|-----------------|--------|
| `get_quote_public` | Get quote by token | ✅ Public | ❌ Not used in portal |
| `request_job_schedule_public` | Request schedule | ✅ Public | ❌ Not used in portal |
| `respond_to_quote_public` | Accept/reject quote | ✅ Public | ❌ Not used in portal |
| `record_payment` | Record payment | ❌ Admin/Crew only | N/A |
| `void_payment` | Void payment | ❌ Admin only | N/A |
| `upsert_invoice_from_job` | Create invoice | ❌ Admin only | N/A |
| `recompute_invoice_status` | Update invoice status | ❌ Admin only | N/A |

### RPCs Missing (Should Exist)

1. ❌ **`get_customer_quotes`** - Fetch all quotes for authenticated customer
2. ❌ **`get_customer_invoices`** - Fetch invoices from `invoices` table (not just `jobs.invoice_path`)
3. ❌ **`get_customer_jobs_summary`** - Optimized summary with totals
4. ❌ **`get_customer_schedule_requests`** - Fetch schedule request statuses

### RLS Policies

**Jobs Table:**
- ⚠️ **No explicit customer RLS policy found** - Relies on implicit filtering via `customer_id` in queries
- ⚠️ **Potential security gap** - If RLS not properly configured, customers could see other customers' jobs

**Quotes Table:**
- ❌ **Customer RLS policy commented out** - `quotes_select_customer_own` exists but is commented (lines 208-224 in `20260128000000_quotes_module.sql`)
- ⚠️ **Customers cannot access quotes** - No way to view quotes in portal

**Payments Table:**
- ✅ **Customer RLS policy exists** - `payments_select_customer_own_jobs` (lines 296-311 in `20260124190000_payments_ledger_overhaul.sql`)
- ✅ **Properly scoped** - Only payments for jobs where `customers.user_id = auth.uid()`

**Invoices Table:**
- ❌ **No customer RLS policy** - `invoices` table RLS only allows admin/manager/dispatcher (lines 140-159 in `20260206000005_create_invoices_table.sql`)
- ⚠️ **Customers cannot access invoices table** - Must use legacy `jobs.invoice_path` + signed URL

**Customer Feedback Table:**
- ⚠️ **RLS policy not found** - No explicit policy in migrations (may rely on default)
- ⚠️ **Potential security gap** - Customers could potentially see other customers' feedback

---

## E) BRANDING + THEMING ISSUES

### Current Branding Integration

**BrandContext:**
- ✅ **Provider exists** - `BrandContext` available globally
- ❌ **Not used in CustomerPortal** - No `useBrand()` hook called
- ❌ **No brand colors applied** - Uses hard-coded `gray-*`, `blue-700`

**CSS Variables:**
- ❌ **Not used** - CustomerPortal doesn't use `--brand-primary`, `--brand-primary-hover`, etc.
- ❌ **Hard-coded colors** - `bg-gray-50`, `text-gray-800`, `bg-gray-200`, `text-blue-700`

**Company Branding:**
- ❌ **No logo display** - CustomerPortal doesn't show company logo
- ❌ **No company name** - Only shows "My Jobs" as heading
- ❌ **No brand colors** - Buttons use default styles

### Issues Found

1. ❌ **No `useBrand()` hook** - CustomerPortal doesn't access brand context
2. ❌ **Hard-coded Tailwind classes** - Should use CSS variables
3. ❌ **No logo/company name** - Missing brand identity
4. ❌ **No brand color on buttons** - Primary buttons should use `--brand-primary`
5. ❌ **No brand color on links** - Links use `text-blue-700` instead of brand color

### Recommended Fixes

```javascript
// Add to CustomerPortal.jsx
import { useBrand } from '../../context/BrandContext'

const { brand } = useBrand()
// Use brand.companyDisplayName, brand.logoUrl, brand.primaryColor
```

Replace hard-coded colors:
- `bg-gray-50` → `bg-slate-50` (or use brand background)
- `text-blue-700` → `var(--brand-primary)`
- `bg-gray-200` → `bg-slate-200`

---

## F) GAPS AND MISSING FEATURES

### Core Features Missing

| Feature | Status | Priority |
|---------|--------|----------|
| **View Quotes** | ❌ Not implemented | HIGH |
| **Accept/Reject Quotes** | ❌ Not implemented | HIGH |
| **View Invoice Details** | ⚠️ Partial (PDF only) | MEDIUM |
| **View Before/After Photos** | ❌ Data loaded but not displayed | MEDIUM |
| **Request Service** | ❌ Not implemented | MEDIUM |
| **Reschedule Jobs** | ❌ Not implemented | MEDIUM |
| **View Schedule Requests** | ❌ Not implemented | MEDIUM |
| **Payment History (detailed)** | ⚠️ Partial (collapsed) | LOW |
| **Customer Profile** | ❌ Not implemented | LOW |
| **Notifications** | ❌ Not implemented | LOW |

### Detailed Gaps

#### 1. Quotes Management
- ❌ **Cannot view quotes** - No quote list or detail view
- ❌ **Cannot accept/reject** - Must use public token link
- ❌ **No quote history** - Cannot see past quotes
- ❌ **No quote status** - Cannot see if quote was accepted/rejected

**Backend Support:**
- ⚠️ **RLS policy commented out** - `quotes_select_customer_own` exists but disabled
- ✅ **Public RPC exists** - `get_quote_public`, `respond_to_quote_public` (but requires token)

#### 2. Invoice Management
- ⚠️ **PDF access only** - Can view/download PDF, but no invoice details
- ❌ **No invoice table access** - Uses legacy `jobs.invoice_path`
- ❌ **No invoice status** - Cannot see if invoice is paid/overdue
- ❌ **No invoice number** - Cannot see invoice number
- ❌ **No due date** - Cannot see payment due date
- ❌ **No balance breakdown** - Only shows job cost, not invoice details

**Backend Support:**
- ❌ **No customer RLS policy** - `invoices` table not accessible to customers
- ⚠️ **Must use signed URL** - Requires edge function call

#### 3. Job Scheduling
- ❌ **Cannot request schedule** - No UI for schedule requests
- ❌ **Cannot view schedule status** - No schedule request status shown
- ❌ **Cannot reschedule** - No reschedule functionality
- ⚠️ **Schedule date shown** - Only displays `service_date`, no request status

**Backend Support:**
- ✅ **RPC exists** - `request_job_schedule_public` (but requires public token)
- ❌ **No authenticated RPC** - Cannot request schedule from portal

#### 4. Before/After Photos
- ❌ **Data loaded but not displayed** - `before_image`, `after_image` selected but never rendered
- ❌ **No photo viewer** - No component to display images
- ❌ **No signed URL logic** - Would need storage bucket access

#### 5. Payment Management
- ⚠️ **Basic history only** - Shows payment list in collapsed `<details>` element
- ❌ **No payment details** - Cannot see full payment receipt
- ❌ **No payment methods** - Limited payment method display
- ❌ **No balance tracking** - Only shows total paid, not balance due per job

#### 6. Customer Profile
- ❌ **No profile page** - Cannot view/edit customer details
- ❌ **No account settings** - No way to update email, phone, address
- ❌ **No password change** - No password management

#### 7. Navigation & UX
- ❌ **No navigation menu** - Single page only
- ❌ **No breadcrumbs** - No navigation context
- ❌ **No search/filter** - Cannot filter jobs by status, date, etc.
- ❌ **No sorting** - Jobs only sorted by `service_date DESC`
- ❌ **No pagination** - All jobs loaded at once

---

## G) OPPORTUNITIES FOR REDESIGN

### UI/UX Improvements

1. **Card-Based Layout**
   - Replace table with card grid
   - Use shadcn Card component
   - Responsive grid (1 col mobile, 2-3 cols desktop)

2. **Navigation Structure**
   - Add sidebar or top nav
   - Use shadcn navigation components
   - Breadcrumb support

3. **Status Badges**
   - Use brand colors for status indicators
   - Consistent badge design across all entities

4. **Empty States**
   - Professional empty state components
   - Actionable CTAs (e.g., "Request a Quote")

5. **Loading States**
   - Skeleton loaders
   - Progressive loading

6. **Responsive Design**
   - Mobile-first approach
   - Touch-friendly interactions

### Feature Enhancements

1. **Dashboard View**
   - Summary cards (total jobs, outstanding balance, upcoming jobs)
   - Recent activity feed
   - Quick actions

2. **Job Detail View**
   - Dedicated job detail page
   - Before/after photos gallery
   - Payment timeline
   - Feedback submission inline

3. **Quote Management**
   - Quote list with status
   - Quote detail view
   - Accept/reject actions
   - Quote history

4. **Invoice Management**
   - Invoice list with status
   - Invoice detail view
   - Payment tracking
   - Download history

5. **Schedule Management**
   - Schedule request form
   - Schedule request status
   - Calendar view
   - Reschedule capability

---

## H) RECOMMENDED STRUCTURE FOR MODERN CUSTOMER PORTAL

### Architecture

```
src/pages/customer/
  ├── CustomerLayout.jsx          # Layout wrapper (header, nav, footer)
  ├── CustomerDashboard.jsx      # Dashboard with summary cards
  ├── Jobs/
  │   ├── JobsList.jsx           # Job list with filters
  │   └── JobDetail.jsx          # Job detail page
  ├── Quotes/
  │   ├── QuotesList.jsx         # Quote list
  │   ├── QuoteDetail.jsx        # Quote detail with accept/reject
  │   └── QuoteHistory.jsx       # Past quotes
  ├── Invoices/
  │   ├── InvoicesList.jsx       # Invoice list
  │   └── InvoiceDetail.jsx      # Invoice detail
  ├── Payments/
  │   └── PaymentHistory.jsx     # Payment history
  ├── Schedule/
  │   ├── ScheduleRequests.jsx   # Schedule request list
  │   └── RequestSchedule.jsx    # Request schedule form
  └── Profile/
      └── CustomerProfile.jsx    # Profile & settings
```

### Component Structure

```
src/components/customer/
  ├── JobCard.jsx                # Reusable job card
  ├── QuoteCard.jsx              # Reusable quote card
  ├── InvoiceCard.jsx            # Reusable invoice card
  ├── PaymentCard.jsx            # Reusable payment card
  ├── StatusBadge.jsx            # Status badge with brand colors
  ├── PhotoGallery.jsx           # Before/after photos
  └── SummaryCard.jsx             # Dashboard summary cards
```

### Navigation Structure

```
Customer Portal Navigation:
  - Dashboard (default)
  - Jobs
  - Quotes
  - Invoices
  - Payments
  - Schedule
  - Profile
```

### Data Flow

**Recommended RPCs:**
1. `get_customer_dashboard_summary(p_customer_id uuid)` - Returns summary stats
2. `get_customer_quotes(p_customer_id uuid)` - Returns all quotes for customer
3. `get_customer_invoices(p_customer_id uuid)` - Returns invoices from `invoices` table
4. `get_customer_jobs_enhanced(p_customer_id uuid)` - Returns jobs with related data
5. `get_customer_schedule_requests(p_customer_id uuid)` - Returns schedule requests

**RLS Policies Needed:**
1. Enable `quotes_select_customer_own` policy (currently commented)
2. Add `invoices_select_customer_own` policy
3. Add `job_schedule_requests_select_customer_own` policy
4. Verify `customer_feedback` RLS policy

### Styling Approach

**Use shadcn UI components:**
- `Card` for containers
- `Button` (already brand-aware)
- `Badge` for status indicators
- `Table` for tabular data (if needed)
- `Dialog` for modals
- `Tabs` for navigation
- `Skeleton` for loading states

**Brand Integration:**
- Use `useBrand()` hook everywhere
- Apply CSS variables (`--brand-primary`, etc.)
- Show company logo and name in header
- Use brand colors for all interactive elements

### Key Features to Implement

1. **Dashboard**
   - Summary cards (jobs, quotes, invoices, balance)
   - Recent activity feed
   - Quick actions

2. **Jobs**
   - Card grid layout
   - Filter by status, date
   - Sort options
   - Job detail page with photos, payments, feedback

3. **Quotes**
   - Quote list with status badges
   - Quote detail with accept/reject actions
   - Quote history

4. **Invoices**
   - Invoice list with status (paid/overdue/sent)
   - Invoice detail with payment tracking
   - Download/view PDF

5. **Schedule**
   - Schedule request form
   - Request status tracking
   - Calendar view (future)

6. **Profile**
   - Customer details
   - Account settings
   - Password change

---

## SECURITY AUDIT SUMMARY

### Issues Found

1. ⚠️ **Jobs RLS** - No explicit customer policy found (may rely on query filtering)
2. ❌ **Quotes RLS** - Customer policy commented out
3. ❌ **Invoices RLS** - No customer policy (customers cannot access `invoices` table)
4. ⚠️ **Customer Feedback RLS** - No explicit policy found
5. ✅ **Payments RLS** - Properly configured

### Recommendations

1. **Add explicit RLS policies** for all customer-accessible tables
2. **Enable quotes RLS policy** (`quotes_select_customer_own`)
3. **Add invoices RLS policy** for customer access
4. **Add customer_feedback RLS policy** to prevent cross-customer access
5. **Verify jobs RLS policy** exists and is properly scoped

---

## CONCLUSION

The Customer Portal is **functional but minimal**. It provides basic job viewing, payment tracking, and feedback submission, but lacks modern UI/UX, comprehensive features, and proper branding integration.

**Key Recommendations:**
1. **Complete redesign** using shadcn UI with card-based layout
2. **Add navigation structure** with multiple routes
3. **Implement missing features** (quotes, invoices, scheduling)
4. **Fix branding integration** (use BrandContext, CSS variables)
5. **Add RLS policies** for customer access to quotes and invoices
6. **Create customer-specific RPCs** for optimized data loading
7. **Implement responsive design** with mobile-first approach

**Priority Order:**
1. **HIGH:** Navigation structure, quotes management, branding integration
2. **MEDIUM:** Invoice management, schedule requests, before/after photos
3. **LOW:** Profile page, advanced filtering, notifications

---

**Report Generated:** 2024-02-06  
**Next Steps:** Begin implementation of new Customer Portal using shadcn UI and recommended structure
