# Route Entitlement & Billing Impact Architecture Audit

## 1. Crew Route Behavior

### Files Related to `/crew` Routes

**Route Definitions (src/App.jsx):**
- `/crew` → `CrewDashboard` (allowedRoles: `['crew', 'admin']`)
- `/crew/jobs` → `CrewPortalMobile` (allowedRoles: `['crew', 'admin']`)
- `/crew/job/:id` → `CrewJobDetail` (allowedRoles: `['crew', 'admin']`)
- `/crew/help` → `CrewHelp` (allowedRoles: `['crew', 'admin']`)

**Page Components:**
- `src/pages/crew/CrewDashboard.jsx`
- `src/pages/crew/CrewPortalMobile.jsx`
- `src/pages/crew/CrewJobDetail.jsx`
- `src/pages/crew/CrewHelp.jsx`

**Layout Components:**
- `src/layouts/CrewLayoutV2.jsx` - Used by all crew routes
- `src/layouts/CrewLayout.jsx` - Legacy layout (not used in current routes)

**Supporting Components:**
- `src/components/crew/JobPhotoPanel.jsx`
- `src/components/crew/JobNextActionCallout.jsx`
- `src/components/crew/JobProgressStepper.jsx`

**Hooks:**
- `src/hooks/useCrewJobs.js` - Fetches crew jobs with team-based filtering

### Guards, Layouts, Hooks, and Page Logic

**Route Protection:**
- `src/ProtectedRoute.jsx` (lines 5-41): Checks `allowedRoles` prop, no billing checks
- `src/App.jsx` (lines 379-417): All crew routes use `ProtectedRoute` with `allowedRoles={['crew', 'admin']}`
- `src/components/OnboardingGuard.jsx` (lines 30-34): **Bypasses billing checks for non-admin routes** - returns children immediately if not admin path

**Layout Behavior:**
- `src/layouts/CrewLayoutV2.jsx`: No billing checks, only navigation and branding
- Layout provides sidebar navigation, user info, logout functionality
- No subscription/billing status checks in layout

**Page Logic Assumptions:**
- `CrewDashboard.jsx`: Assumes access to jobs via `useCrewJobs` hook
- `CrewPortalMobile.jsx`: Assumes access to jobs, payments, realtime subscriptions
- `CrewJobDetail.jsx`: Assumes ability to update jobs, record payments, upload photos

### Billing/Subscription References in Crew Code

**Search Results:**
- **NO references** to `subscription_status`, `billing_grace_until`, `trial_ends_at`, or `plan` in:
  - `src/pages/crew/*.jsx`
  - `src/layouts/CrewLayoutV2.jsx`
  - `src/components/crew/*.jsx`
  - `src/hooks/useCrewJobs.js`

**Conclusion:** Crew routes have **zero billing enforcement** and assume access remains available regardless of subscription status.

---

## 2. Customer Route Behavior

### Files Related to `/customer` Routes

**Route Definitions (src/App.jsx):**
- `/customer` → `DashboardPage` (allowedRoles: `['customer']`)
- `/customer/dashboard` → `DashboardPage` (allowedRoles: `['customer']`)
- `/customer/jobs` → `JobsListPage` (allowedRoles: `['customer']`)
- `/customer/jobs/:id` → `JobDetailPage` (allowedRoles: `['customer']`)
- `/customer/quotes` → `QuotesListPage` (allowedRoles: `['customer']`)
- `/customer/quotes/:id` → `QuoteDetailPage` (allowedRoles: `['customer']`)
- `/customer/invoices` → `InvoicesListPage` (allowedRoles: `['customer']`)
- `/customer/invoices/:id` → `InvoiceDetailPage` (allowedRoles: `['customer']`)
- `/customer/schedule` → `SchedulePage` (allowedRoles: `['customer']`)
- `/customer/profile` → `ProfilePage` (allowedRoles: `['customer']`)

**Page Components:**
- `src/pages/customer/DashboardPage.jsx`
- `src/pages/customer/JobsListPage.jsx`
- `src/pages/customer/JobDetailPage.jsx`
- `src/pages/customer/QuotesListPage.jsx`
- `src/pages/customer/QuoteDetailPage.jsx`
- `src/pages/customer/InvoicesListPage.jsx`
- `src/pages/customer/InvoiceDetailPage.jsx`
- `src/pages/customer/SchedulePage.jsx`
- `src/pages/customer/ProfilePage.jsx`

**Layout Components:**
- `src/layouts/customer/CustomerAppShell.jsx` - Used by all customer routes

**Supporting Components:**
- `src/components/customer/JobCard.jsx`
- `src/components/customer/InvoiceCard.jsx`
- `src/components/customer/EmptyState.jsx`
- `src/components/customer/SummaryCard.jsx`
- `src/components/customer/PhotoGallery.jsx`
- `src/components/customer/StatusBadge.jsx`
- `src/components/customer/QuoteCard.jsx`
- `src/components/customer/LoadingSkeleton.jsx`

### Guards, Layouts, Hooks, and Page Logic

**Route Protection:**
- `src/ProtectedRoute.jsx` (lines 5-41): Checks `allowedRoles` prop, no billing checks
- `src/App.jsx` (lines 298-377): All customer routes use `ProtectedRoute` with `allowedRoles={['customer']}`
- `src/components/OnboardingGuard.jsx` (lines 30-34): **Bypasses billing checks for non-admin routes** - returns children immediately if not admin path

**Layout Behavior:**
- `src/layouts/customer/CustomerAppShell.jsx`: No billing checks, only navigation and branding
- Layout provides navigation menu, user info, logout functionality
- No subscription/billing status checks in layout

**Page Logic Assumptions:**
- All customer pages assume access to their own data (jobs, quotes, invoices)
- `ProfilePage.jsx` (line 64): Can update customer profile directly
- `JobDetailPage.jsx` (line 199): Can call `request_job_reschedule` RPC
- `QuoteDetailPage.jsx` (lines 79, 122): Can call `respond_to_quote_public` RPC

### Billing/Subscription References in Customer Code

**Search Results:**
- **NO references** to `subscription_status`, `billing_grace_until`, `trial_ends_at`, or `plan` in:
  - `src/pages/customer/*.jsx`
  - `src/layouts/customer/CustomerAppShell.jsx`
  - `src/components/customer/*.jsx`

**Conclusion:** Customer routes have **zero billing enforcement** and assume access remains available regardless of subscription status.

---

## 3. Admin + Non-Admin Role Matrix

### allowedRoles Usage in App.jsx

**Admin-Only Routes (allowedRoles: `['admin']`):**
- `/admin/jobs`
- `/admin/jobs/needs-scheduling`
- `/admin/payments`
- `/admin/expenses`
- `/admin/settings`
- `/admin/billing`
- `/admin/recurring-jobs`
- `/admin/customers`
- `/admin/crew`
- `/admin/teams`
- `/admin/schedule`
- `/admin/schedule/requests`
- `/admin/quotes`
- `/admin/quotes/new`
- `/admin/quotes/:id`
- `/admin/onboarding`
- `/admin` (dashboard)
- `/` (root, redirects to CustomerDashboard but requires admin role - line 292)

**Admin + Manager + Dispatcher Routes:**
- `/admin/revenue-hub` (allowedRoles: `['admin', 'manager', 'dispatcher']`)

**Crew + Admin Routes:**
- `/crew` (allowedRoles: `['crew', 'admin']`)
- `/crew/jobs` (allowedRoles: `['crew', 'admin']`)
- `/crew/job/:id` (allowedRoles: `['crew', 'admin']`)
- `/crew/help` (allowedRoles: `['crew', 'admin']`)

**Customer-Only Routes:**
- `/customer` (allowedRoles: `['customer']`)
- `/customer/dashboard` (allowedRoles: `['customer']`)
- `/customer/jobs` (allowedRoles: `['customer']`)
- `/customer/jobs/:id` (allowedRoles: `['customer']`)
- `/customer/quotes` (allowedRoles: `['customer']`)
- `/customer/quotes/:id` (allowedRoles: `['customer']`)
- `/customer/invoices` (allowedRoles: `['customer']`)
- `/customer/invoices/:id` (allowedRoles: `['customer']`)
- `/customer/schedule` (allowedRoles: `['customer']`)
- `/customer/profile` (allowedRoles: `['customer']`)

**Public Routes (No Protection):**
- `/login`
- `/customer/login`
- `/customer/accept-invite`
- `/quote/:token`
- `/quote/:token/receipt`
- `/schedule/:token`
- `/auth/callback`
- `/bootstrap/company`
- `/forgot-password`
- `/reset-password`

### Route Matrix Summary

| Route Pattern | Allowed Roles | Billing-Gated? |
|--------------|---------------|----------------|
| `/admin/*` | `admin` | **YES** (via OnboardingGuard) |
| `/admin/revenue-hub` | `admin`, `manager`, `dispatcher` | **YES** (via OnboardingGuard) |
| `/crew/*` | `crew`, `admin` | **NO** |
| `/customer/*` | `customer` | **NO** |
| Public routes | None | **NO** |

---

## 4. Backend Operations Still Possible When UI is Blocked

### Crew Pages - Database Operations

**Direct Table Updates (src/pages/crew/CrewJobDetail.jsx):**
- Line 229: `supabase.from('jobs').update({ before_image })` - Direct update
- Line 271: `supabase.from('jobs').update({ after_image })` - Direct update
- Line 333: `supabase.from('jobs').update({ status: 'Completed', before_image, after_image })` - Direct update

**RPC Function Calls:**
- Line 374: `supabase.rpc('start_job_session', { p_job_id })` - RPC call
- Line 400: `supabase.rpc('stop_job_session', { p_job_id })` - RPC call
- Line 510: `supabase.rpc('record_payment', { ... })` - RPC call (inserts into payments table)
- Line 598: `supabase.rpc('crew_add_job_note', { ... })` - RPC call
- Line 629: `supabase.rpc('crew_flag_job_issue', { ... })` - RPC call
- Line 346: `supabase.rpc('log_customer_activity', { ... })` - RPC call

**Storage Operations:**
- Lines 216-218: `supabase.storage.from('job-images').upload(...)` - Storage upload
- Lines 213, 255, 303, 319: `supabase.storage.from('job-images').remove(...)` - Storage deletion

**CrewPortalMobile.jsx:**
- Line 494: `supabase.rpc('start_job_session', { p_job_id })` - RPC call
- Line 518: `supabase.rpc('stop_job_session', { p_job_id })` - RPC call

### Customer Pages - Database Operations

**Direct Table Updates:**
- `src/pages/customer/ProfilePage.jsx` (line 64): `supabase.from('customers').update(...)` - Direct update

**RPC Function Calls:**
- `src/pages/customer/JobDetailPage.jsx` (line 199): `supabase.rpc('request_job_reschedule', { ... })` - RPC call
- `src/pages/customer/DashboardPage.jsx` (line 49): `supabase.rpc('get_customer_dashboard_summary', { ... })` - RPC call
- `src/pages/customer/QuoteDetailPage.jsx` (lines 79, 122): `supabase.rpc('respond_to_quote_public', { ... })` - RPC call

### RPC Functions Used by Crew

**record_payment (supabase/migrations/20260124190000_payments_ledger_overhaul.sql):**
- **Operation:** Inserts into `payments` table
- **Access:** Requires role `admin` or `crew`
- **Crew Restriction:** Crew can only record payments for jobs assigned to their team
- **Bypass Risk:** If UI is blocked but RPC is accessible, crew can still record payments via direct API calls

**start_job_session / stop_job_session:**
- **Operation:** Updates `jobs` table (started_at, completed_at)
- **Access:** Crew role required
- **Bypass Risk:** Crew can start/stop job sessions even if UI is blocked

**crew_add_job_note / crew_flag_job_issue:**
- **Operation:** Inserts into job notes/flags tables
- **Access:** Crew role required
- **Bypass Risk:** Crew can add notes/flag issues even if UI is blocked

**log_customer_activity:**
- **Operation:** Inserts into customer_activity_log
- **Access:** Admin/crew role required
- **Bypass Risk:** Activity logging continues even if UI is blocked

### Direct vs RPC Operations

**Direct Operations (Bypassable if RLS allows):**
- Job image updates (before_image, after_image)
- Job status updates (status: 'Completed')
- Customer profile updates

**RPC Operations (Backend-enforced):**
- Payment recording (`record_payment`)
- Job session management (`start_job_session`, `stop_job_session`)
- Job notes/flags (`crew_add_job_note`, `crew_flag_job_issue`)
- Customer activity logging (`log_customer_activity`)
- Job reschedule requests (`request_job_reschedule`)
- Quote responses (`respond_to_quote_public`)

**Critical Finding:** Crew operations use **both direct updates AND RPC functions**. If UI is blocked but RLS policies allow direct updates, crew can still:
1. Update job images
2. Mark jobs as completed
3. Record payments (via RPC if accessible)
4. Start/stop job sessions (via RPC if accessible)

---

## 5. Final Section

### Currently Billing-Gated Routes

**Enforcement Location:** `src/components/OnboardingGuard.jsx` (lines 99-152)

**Gated Routes:**
- All `/admin/*` routes (except allowed routes below)
- `/admin/revenue-hub` (manager/dispatcher access)

**Billing Check Logic:**
```javascript
const billingStatus = profile.subscription_status || "inactive";
const graceUntilRaw = profile.billing_grace_until || null;
const hasActiveBilling = billingStatus === "trialing" || billingStatus === "active" || hasValidGrace;
```

**Allowed Routes (Even Without Active Billing):**
- `/admin/billing`
- `/admin/settings`
- `/admin/onboarding`
- `/bootstrap/company`

**Blocked Behavior:**
- Shows "Billing Access Required" message
- Redirects to `/admin/billing` or `/admin/settings`
- Prevents access to all other admin routes

### Currently NOT Billing-Gated Routes

**Crew Routes:**
- `/crew`
- `/crew/jobs`
- `/crew/job/:id`
- `/crew/help`

**Customer Routes:**
- `/customer`
- `/customer/dashboard`
- `/customer/jobs`
- `/customer/jobs/:id`
- `/customer/quotes`
- `/customer/quotes/:id`
- `/customer/invoices`
- `/customer/invoices/:id`
- `/customer/schedule`
- `/customer/profile`

**Public Routes:**
- `/quote/:token`
- `/quote/:token/receipt`
- `/schedule/:token`
- `/login`
- `/customer/login`

### Impact Assessment: Extending Billing Enforcement to Crew

**Essential Field Operations at Risk:**

1. **Job Completion Workflow:**
   - Upload before/after photos (direct updates to `jobs` table)
   - Mark jobs as completed (direct update to `jobs.status`)
   - Start/stop job sessions (RPC: `start_job_session`, `stop_job_session`)

2. **Payment Collection:**
   - Record payments (RPC: `record_payment`)
   - Critical for cash flow - blocking this would prevent field workers from collecting payments

3. **Job Communication:**
   - Add job notes (RPC: `crew_add_job_note`)
   - Flag job issues (RPC: `crew_flag_job_issue`)
   - Log customer activity (RPC: `log_customer_activity`)

**Conclusion:** Extending billing enforcement to crew routes **WOULD block essential field operations**, including:
- Job completion (photos, status updates)
- Payment collection (critical revenue operation)
- Real-time job communication (notes, flags)

**Recommendation:** Crew routes should remain **exempt from billing enforcement** to maintain field operations continuity, OR billing enforcement should allow grace period for crew operations.

### Customer Portal Subscription Gating Intent

**Evidence:**
- **NO billing checks** in customer routes
- **NO subscription references** in customer code
- Customer routes use same `ProtectedRoute` pattern as crew (role-only checks)
- `OnboardingGuard` explicitly bypasses non-admin routes (line 30-34)

**Conclusion:** Customer portal **does NOT appear intended to be subscription-gated**. Current architecture treats customer access as independent of company subscription status.

**Rationale:**
- Customer portal is customer-facing, not company-facing
- Blocking customer access due to company billing issues would harm customer experience
- Customer routes have zero billing enforcement code

---

## Summary

1. **Crew routes:** Zero billing enforcement, assume access always available
2. **Customer routes:** Zero billing enforcement, assume access always available
3. **Admin routes:** Full billing enforcement via `OnboardingGuard`
4. **Backend operations:** Crew can still perform critical operations (payments, job completion) via direct updates and RPC calls even if UI is blocked
5. **Risk:** Extending billing enforcement to crew would block essential field operations (job completion, payment collection)
6. **Customer portal:** Not intended to be subscription-gated based on current architecture
