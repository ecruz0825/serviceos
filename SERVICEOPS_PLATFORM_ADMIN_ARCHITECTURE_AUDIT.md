# ServiceOps Platform Admin Architecture Audit

**Date:** 2026-03-11  
**Purpose:** Audit current auth, role, route, and navigation architecture to safely introduce `platform_admin` role without breaking tenant admin access.

---

## A. Current Role Model

### Database Schema

**Table:** `public.profiles`
- **Location:** `supabase/migrations/20260126000002_profiles_setup_and_rls.sql`
- **Role Column:** `role text` (no CHECK constraint, no enum)
- **Current Allowed Values:**
  - `'admin'` - Tenant admin (company owner/manager)
  - `'crew'` - Field worker
  - `'customer'` - Customer portal user
  - `'manager'` - Revenue hub access (subset of admin)
  - `'dispatcher'` - Revenue hub access (subset of admin)

**Key Observations:**
- No database CHECK constraint on `role` values
- No enum type used
- Role validation happens in application code (Edge Functions, RPCs, frontend)
- `company_id` is required for tenant roles (`admin`, `crew`, `customer`, `manager`, `dispatcher`)
- `company_id` can be NULL (used for platform-level users in future)

### Role Hierarchy (Current Understanding)

1. **Tenant Roles** (require `company_id`):
   - `admin` - Full tenant control
   - `manager` - Revenue hub only
   - `dispatcher` - Revenue hub only
   - `crew` - Field worker portal
   - `customer` - Customer portal

2. **Platform Roles** (planned):
   - `platform_admin` - Cross-tenant platform management (no `company_id`)

---

## B. Exact Files That Enforce Roles

### Database Functions & RLS Policies

#### 1. Helper Functions
- **`public.current_user_role()`**
  - **File:** `supabase/migrations/20260124190000_payments_ledger_overhaul.sql:54-62`
  - **Returns:** `text` - role from profiles table
  - **Used by:** RLS policies, RPC functions

#### 2. RLS Policies Using Roles

**Profiles Table:**
- **File:** `supabase/migrations/20260126000002_profiles_setup_and_rls.sql:103-112`
- **Policy:** `profiles_select_admin_all_company`
- **Check:** `public.current_user_role() = 'admin'`

**Payments Table:**
- **File:** `supabase/migrations/20260124190000_payments_ledger_overhaul.sql:268-311`
- **Policies:**
  - `payments_select_admin` - checks `current_user_role() = 'admin'`
  - `payments_select_crew_assigned` - checks `current_user_role() = 'crew'`
  - `payments_select_customer_own_jobs` - checks `current_user_role() = 'customer'`

#### 3. RPC Functions with Role Checks

**Pattern:** Most RPCs check role via:
```sql
SELECT p.role, p.company_id INTO v_role, v_company_id
FROM public.profiles p
WHERE p.id = auth.uid();

IF v_role NOT IN ('admin','crew') THEN
  RAISE EXCEPTION 'NOT_ALLOWED';
END IF;
```

**Key RPCs with Role Checks:**
- `public.record_payment()` - `supabase/migrations/20260124190000_payments_ledger_overhaul.sql:117-119`
  - Allows: `'admin'`, `'crew'`
- `public.void_payment()` - `supabase/migrations/20260124190000_payments_ledger_overhaul.sql:231`
  - Allows: `'admin'` only
- Many other RPCs check `v_role <> 'admin'` or `v_role = 'crew'`
- **Search pattern:** `grep -r "v_role.*IN\|v_role.*=" supabase/migrations` shows ~50+ occurrences

### Frontend Role Enforcement

#### 1. ProtectedRoute Component
- **File:** `src/ProtectedRoute.jsx`
- **Logic:** 
  ```jsx
  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to={loginPath} replace />;
  }
  ```
- **Usage:** Wraps all route definitions in `src/App.jsx`

#### 2. OnboardingGuard Component
- **File:** `src/components/OnboardingGuard.jsx`
- **Role Checks:**
  - Line 38: `const isInternalRole = ["admin", "manager", "dispatcher"].includes(profile.role);`
  - Line 39: `if (isInternalRole && !profile.company_id && profile.role !== "admin")`
  - Line 56: `profile.role !== "admin"`
  - Line 74: `const isAdminUser = profile.role === "admin";`
- **Purpose:** Blocks admin routes for non-admin internal roles without company context

#### 3. UserContext
- **File:** `src/context/UserContext.jsx`
- **Role Access:** `role: profile?.role || null` (line 222)
- **Auto-linking Logic:** Line 75 - `if (existingProfile.role === 'customer' || !existingProfile.role)`

### Edge Functions

#### invite-user Function
- **File:** `supabase/functions/invite-user/index.ts:38-42`
- **Validation:**
  ```typescript
  const allowedRoles = ["customer", "crew", "admin", "manager", "dispatcher"];
  if (!allowedRoles.includes(normalizedRole)) {
    return errorResponse(400, "VALIDATION_ERROR", "role must be one of...");
  }
  ```

---

## C. Exact Files That Define Routes

### Main Route Configuration
- **File:** `src/App.jsx`

### Route Patterns

#### Admin Routes (`/admin/*`)
- **Protected by:** `<ProtectedRoute allowedRoles={['admin']}>`
- **Routes:**
  - `/admin` - Dashboard
  - `/admin/jobs` - Jobs list
  - `/admin/jobs/needs-scheduling` - Jobs needing scheduling
  - `/admin/payments` - Payments
  - `/admin/expenses` - Expenses
  - `/admin/settings` - Settings
  - `/admin/billing` - Billing
  - `/admin/recurring-jobs` - Recurring jobs
  - `/admin/customers` - Customers
  - `/admin/crew` - Workers
  - `/admin/teams` - Teams
  - `/admin/schedule` - Schedule
  - `/admin/schedule/requests` - Schedule requests
  - `/admin/quotes` - Quotes list
  - `/admin/quotes/new` - New quote
  - `/admin/quotes/:id` - Quote detail
  - `/admin/revenue-hub` - Revenue hub (also allows `'manager'`, `'dispatcher'`)
  - `/admin/onboarding` - Onboarding wizard

#### Crew Routes (`/crew/*`)
- **Protected by:** `<ProtectedRoute allowedRoles={['crew', 'admin']}>`
- **Routes:**
  - `/crew` - Crew dashboard
  - `/crew/jobs` - Jobs list
  - `/crew/job/:id` - Job detail
  - `/crew/help` - Help

#### Customer Routes (`/customer/*`)
- **Protected by:** `<ProtectedRoute allowedRoles={['customer']}>`
- **Routes:**
  - `/customer` - Dashboard
  - `/customer/dashboard` - Dashboard
  - `/customer/jobs` - Jobs list
  - `/customer/jobs/:id` - Job detail
  - `/customer/quotes` - Quotes list
  - `/customer/quotes/:id` - Quote detail
  - `/customer/invoices` - Invoices list
  - `/customer/invoices/:id` - Invoice detail
  - `/customer/schedule` - Schedule
  - `/customer/profile` - Profile

#### Public Routes
- `/quote/:token` - Public quote view
- `/quote/:token/receipt` - Public quote receipt
- `/schedule/:token` - Public schedule request
- `/login` - Login page
- `/customer/login` - Customer login
- `/forgot-password` - Forgot password
- `/reset-password` - Reset password
- `/auth/callback` - Auth callback
- `/bootstrap/company` - Company bootstrap

### Route Redirects

#### Login Redirects
- **File:** `src/Login.jsx:18-26`
  - `customer` → `/customer/dashboard`
  - `admin` → `/admin`
  - `manager` or `dispatcher` → `/admin/revenue-hub`
  - `crew` → `/crew`

#### Auth Callback Redirects
- **File:** `src/pages/AuthCallback.jsx:297-301`
  - `admin` → `/admin`
  - `manager` or `dispatcher` → `/admin/revenue-hub`
  - `crew` → `/crew`
  - `customer` → `/customer/dashboard`

#### Root Redirect
- **File:** `src/App.jsx:289`
  - `/` → `/admin` (Navigate replace)

---

## D. Exact Files That Define Navigation

### Sidebar Navigation
- **File:** `src/components/nav/Sidebar.jsx`
- **Config Source:** `src/components/nav/navConfig.js`
- **Logic:** `getNavItems({ role, settings })` returns items based on role

### Navigation Configuration
- **File:** `src/components/nav/navConfig.js`
- **Role-Based Items:**
  - **Admin** (line 18): Full admin menu (dashboard, jobs, customers, quotes, revenue hub, crew, teams, payments, expenses, recurring jobs, schedule, settings, billing, worker portal)
  - **Manager/Dispatcher** (line 94): Revenue Hub only
  - **Crew** (line 103): Worker Portal only
  - **Customer** (line 112): Customer Portal only

### Top Navbar
- **File:** `src/Navbar.jsx`
- **Role-Based Links:**
  - Line 74: Dashboard link - `role === 'crew' ? '/crew' : role === 'admin' ? '/admin' : '/'`
  - Line 82: Crew link - `role === 'crew' || role === 'admin'`
  - Line 89: Admin dropdown - `role === 'admin'` only

---

## E. Risks / Breakpoints for Adding `platform_admin`

### Critical Risks

#### 1. Route Collision
- **Risk:** `platform_admin` users might be redirected to `/admin` (tenant admin area)
- **Files Affected:**
  - `src/Login.jsx:20-21` - Redirects `admin` → `/admin`
  - `src/pages/AuthCallback.jsx:298` - Redirects `admin` → `/admin`
  - `src/App.jsx:289` - Root redirect → `/admin`
- **Impact:** Platform admin would see tenant admin UI, potentially confusing

#### 2. ProtectedRoute Logic
- **Risk:** `platform_admin` might pass `allowedRoles={['admin']}` checks
- **File:** `src/ProtectedRoute.jsx:31`
- **Current Logic:** `!allowedRoles.includes(role)` - would block `platform_admin` from `/admin/*` routes
- **Impact:** Platform admin would be blocked from tenant admin routes (good), but needs own routes

#### 3. OnboardingGuard Blocking
- **Risk:** `OnboardingGuard` checks `profile.role === "admin"` for onboarding logic
- **File:** `src/components/OnboardingGuard.jsx:74`
- **Impact:** Platform admin would be treated as tenant admin, might trigger onboarding flows

#### 4. Navigation Menu
- **Risk:** `navConfig.js` only has `role === "admin"` check, no `platform_admin`
- **File:** `src/components/nav/navConfig.js:18`
- **Impact:** Platform admin would see no navigation items (or wrong items)

#### 5. Database RLS Policies
- **Risk:** RLS policies check `current_user_role() = 'admin'` for tenant admin access
- **Files:** Multiple migrations
- **Impact:** Platform admin might be blocked from tenant data (good), but needs platform-level policies

#### 6. RPC Function Role Checks
- **Risk:** Many RPCs check `v_role NOT IN ('admin','crew')` or `v_role <> 'admin'`
- **Files:** ~50+ RPC functions in migrations
- **Impact:** Platform admin would be blocked from tenant RPCs (good), but needs platform-level RPCs

#### 7. Company ID Dependency
- **Risk:** Many checks require `company_id IS NOT NULL`
- **Files:** Multiple RPCs, RLS policies
- **Impact:** Platform admin (no `company_id`) would be blocked from tenant operations (good)

#### 8. Invite-User Function
- **Risk:** `invite-user` only allows `["customer", "crew", "admin", "manager", "dispatcher"]`
- **File:** `supabase/functions/invite-user/index.ts:39`
- **Impact:** Cannot invite `platform_admin` users via this function

### Medium Risks

#### 9. Navbar Dashboard Link
- **File:** `src/Navbar.jsx:74`
- **Risk:** `platform_admin` would fall through to `/` (which redirects to `/admin`)
- **Impact:** Confusing redirect chain

#### 10. Sentry Tagging
- **File:** `src/App.jsx:92-101`
- **Risk:** Sentry tags based on route prefix, not role
- **Impact:** Platform admin routes might be tagged incorrectly

### Low Risks

#### 11. Customer Auto-Linking
- **File:** `src/context/UserContext.jsx:75`
- **Risk:** Auto-link logic checks `role === 'customer' || !existingProfile.role`
- **Impact:** Platform admin would not be auto-linked (good)

---

## F. Recommended Implementation Order

### Phase 1: Database Foundation
1. **Add `platform_admin` to allowed roles**
   - Update `supabase/functions/invite-user/index.ts:39` to include `"platform_admin"`
   - No database migration needed (no CHECK constraint exists)

2. **Create platform-level RLS policies**
   - New policies for `platform_admin` users (no `company_id` required)
   - Ensure tenant RLS policies explicitly exclude `platform_admin`

3. **Create platform-level RPC functions**
   - New RPCs for platform operations (company management, user management, etc.)
   - Ensure tenant RPCs explicitly exclude `platform_admin`

### Phase 2: Route Architecture
4. **Create `/platform/*` route family**
   - Add routes in `src/App.jsx`
   - Use `<ProtectedRoute allowedRoles={['platform_admin']}>`

5. **Update redirect logic**
   - `src/Login.jsx` - Add `platform_admin` → `/platform` redirect
   - `src/pages/AuthCallback.jsx` - Add `platform_admin` → `/platform` redirect
   - `src/App.jsx` - Update root redirect to check role first

6. **Create platform admin pages**
   - `/platform` - Platform dashboard
   - `/platform/companies` - Company management
   - `/platform/users` - User management
   - `/platform/billing` - Platform billing overview
   - etc.

### Phase 3: Navigation
7. **Update navigation config**
   - `src/components/nav/navConfig.js` - Add `platform_admin` section
   - Create platform admin navigation items

8. **Update Navbar**
   - `src/Navbar.jsx` - Add platform admin dashboard link
   - Ensure platform admin doesn't see tenant admin links

### Phase 4: Guard Updates
9. **Update OnboardingGuard**
   - `src/components/OnboardingGuard.jsx` - Exclude `platform_admin` from tenant onboarding flows
   - Add platform-level onboarding if needed

10. **Update ProtectedRoute**
    - Ensure `platform_admin` cannot access tenant routes
    - Ensure tenant roles cannot access platform routes

### Phase 5: Testing & Hardening
11. **Test role isolation**
    - Verify `platform_admin` cannot access `/admin/*` routes
    - Verify tenant `admin` cannot access `/platform/*` routes
    - Verify RLS policies block cross-tenant access

12. **Update documentation**
    - Document platform admin role
    - Document route architecture
    - Document RLS policy changes

---

## Summary

### Current State
- **Roles:** `admin`, `crew`, `customer`, `manager`, `dispatcher` (all tenant-scoped)
- **Route Families:** `/admin/*`, `/crew/*`, `/customer/*`
- **Role Enforcement:** Database RLS, RPC functions, frontend ProtectedRoute
- **Navigation:** Role-based sidebar and navbar

### Key Breakpoints
1. **Route redirects** assume `admin` → `/admin` (tenant area)
2. **RLS policies** check `role = 'admin'` for tenant admin access
3. **RPC functions** check `role IN ('admin','crew')` for tenant operations
4. **Navigation** only has `role === "admin"` check (no platform admin)
5. **OnboardingGuard** treats `admin` as tenant admin

### Safe Implementation Strategy
- Create separate `/platform/*` route family
- Ensure `platform_admin` is explicitly excluded from tenant checks
- Add platform-level RLS policies and RPCs
- Update all redirect logic to route `platform_admin` to `/platform`
- Keep tenant admin routes unchanged

---

**End of Audit**
