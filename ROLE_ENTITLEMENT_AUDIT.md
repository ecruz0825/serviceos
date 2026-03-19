# Role Entitlement Audit Report
**Service Ops SaaS - Launch Hardening Phase A**

**Date**: 2024-03-19  
**Scope**: Full internal role entitlement audit across routing, navigation, page actions, and backend alignment  
**Audit Type**: Read-only security and consistency review

---

## Executive Summary

This audit examined role-based access control (RBAC) across the Service Ops SaaS application, focusing on consistency between route protection, navigation visibility, page-level actions, and backend authorization. The audit identified **6 P0 launch blockers**, **8 P1 serious inconsistencies**, and **5 P2 polish items**.

### Key Findings

1. **Manager/Dispatcher Navigation Mismatch (P1)**: Manager and dispatcher roles can access 6 operational pages via routes, but navigation only shows "Revenue Hub". This creates discoverability issues and potential confusion.

2. **Support Mode Billing Access (P0)**: Platform admin in support mode can access BillingAdmin page (via ProtectedRoute special case), but billing Edge Functions reject support mode. This creates UI/backend mismatch.

3. **Settings Page No Role Check (P1)**: Settings page has no internal role checks beyond route protection. If route protection is bypassed, full settings access is available.

4. **Crew Portal Admin Access (P2)**: Admin role can access crew portal routes (`/crew/*`), which may be intentional but creates role overlap.

5. **Backend RPC Role Gaps (P1)**: Some RPCs allow manager/dispatcher access (e.g., `generate_jobs_from_recurring`), but frontend pages that call these RPCs are admin-only, creating potential backend access without UI.

6. **Platform Admin Support Mode Navigation (P1)**: Platform admin in support mode sees full admin navigation, but some actions are disabled via `supportMode` checks. Navigation doesn't indicate read-only state.

---

## Confirmed Role Model

### Roles Defined in Codebase

1. **admin**: Full tenant company access, all admin pages, billing, settings, mutations
2. **manager**: Limited operational access (Revenue Hub, Route Planning, Dispatch, Scheduling, Job Intelligence, Financial Control Center)
3. **dispatcher**: Same as manager (treated identically in code)
4. **crew**: Crew portal access, can record payments for assigned jobs
5. **customer**: Customer portal access, read-only view of own jobs/quotes/invoices
6. **platform_admin**: Platform-level access, can enter support mode to access tenant admin pages

### Support Mode Behavior

- **Platform admin** can start support session for a target company
- In support mode, platform admin:
  - Can access admin routes (via ProtectedRoute special case)
  - Sees full admin navigation (via navConfig.js)
  - Has mutations disabled via `supportMode` checks in UI
  - Cannot trigger billing actions (Edge Functions reject support mode)

---

## Top Launch Risks by Severity

### P0 - Launch Blockers / Security Risks

1. **Support Mode Billing Access Mismatch**
   - **Location**: `src/ProtectedRoute.jsx:33`, `supabase/functions/create-billing-checkout-session/index.ts:118-121`
   - **Issue**: Platform admin in support mode can access BillingAdmin page, but Edge Functions reject support mode. User sees billing page but actions fail.
   - **Risk**: Confusing UX, potential support ticket escalation
   - **Fix**: Either allow support mode in billing Edge Functions OR block BillingAdmin route for support mode

2. **Manager/Dispatcher Route Access Without Navigation**
   - **Location**: `src/App.jsx:276-331`, `src/components/nav/navConfig.js:114-120`
   - **Issue**: Manager/dispatcher can access 6 pages via routes but nav only shows Revenue Hub
   - **Risk**: Users can't discover available features, poor UX
   - **Fix**: Add manager/dispatcher nav items OR restrict routes to admin-only

3. **Settings Page No Internal Role Check**
   - **Location**: `src/pages/admin/Settings.jsx`
   - **Issue**: No role checks beyond route protection. Direct URL access (if route bypassed) allows full settings mutation.
   - **Risk**: If route protection fails, settings are exposed
   - **Fix**: Add role check at page level, disable mutations for non-admin

4. **Billing Reconciliation Authorization Gap**
   - **Location**: `supabase/functions/reconcile-billing/index.ts:135-156`
   - **Issue**: Edge Function allows platform_admin in support mode, but BillingAdmin UI checks `canReconcile` which may not match exactly
   - **Risk**: Authorization mismatch between UI and backend
   - **Fix**: Verify UI and backend authorization logic match exactly

5. **Crew Portal Admin Access**
   - **Location**: `src/App.jsx:469-507`
   - **Issue**: Admin role can access crew portal routes (`/crew/*`). May be intentional but creates role overlap.
   - **Risk**: Admin users may accidentally use crew portal instead of admin pages
   - **Fix**: Clarify if intentional, or restrict crew portal to crew role only

6. **Platform Admin Support Mode Mutation Disabling**
   - **Location**: Multiple admin pages (JobsAdmin, CustomersAdmin, PaymentsAdmin, etc.)
   - **Issue**: Support mode disables mutations via UI checks, but navigation doesn't indicate read-only state
   - **Risk**: Platform admin may not realize they're in read-only mode
   - **Fix**: Add visual indicator in navigation or page header when in support mode

### P1 - Serious Inconsistencies / Likely Support Issues

7. **Manager/Dispatcher Backend RPC Access**
   - **Location**: `supabase/migrations/20260317000000_generate_jobs_from_recurring_rpc.sql:49`, `supabase/migrations/20260316000000_route_optimization_foundation.sql:137`
   - **Issue**: RPCs allow manager/dispatcher, but frontend pages that call them are admin-only
   - **Risk**: Backend allows access that UI doesn't provide
   - **Fix**: Either expose RPC calls to manager/dispatcher pages OR restrict RPCs to admin-only

8. **Revenue Hub Role Access**
   - **Location**: `src/App.jsx:276`, `src/components/nav/navConfig.js:116-119`
   - **Issue**: Revenue Hub allows admin/manager/dispatcher, but page may have admin-only mutations
   - **Risk**: Manager/dispatcher may see actions they can't use
   - **Fix**: Audit RevenueHub page for role-appropriate action gating

9. **Route Planning Role Access**
   - **Location**: `src/App.jsx:284`, `src/pages/admin/RoutePlanningAdmin.jsx`
   - **Issue**: Route Planning allows admin/manager/dispatcher, but page has no role checks
   - **Risk**: Manager/dispatcher may have full route planning access (may be intentional)
   - **Fix**: Verify if manager/dispatcher should have full route planning access

10. **Dispatch Center Role Access**
    - **Location**: `src/App.jsx:294`, `src/pages/admin/DispatchCenterAdmin.jsx`
    - **Issue**: Dispatch Center allows admin/manager/dispatcher, page allows team assignment mutations
    - **Risk**: Manager/dispatcher can assign teams (may be intentional)
    - **Fix**: Verify if manager/dispatcher should be able to assign teams

11. **Scheduling Center Role Access**
    - **Location**: `src/App.jsx:304`, `src/pages/admin/SchedulingCenterAdmin.jsx`
    - **Issue**: Scheduling Center allows admin/manager/dispatcher, page calls `generate_jobs_from_recurring` RPC
    - **Risk**: Manager/dispatcher can generate jobs (RPC allows it)
    - **Fix**: Verify if manager/dispatcher should generate jobs

12. **Job Intelligence Role Access**
    - **Location**: `src/App.jsx:314`, `src/pages/admin/JobIntelligenceAdmin.jsx`
    - **Issue**: Job Intelligence allows admin/manager/dispatcher, page allows team assignment
    - **Risk**: Manager/dispatcher can assign teams (may be intentional)
    - **Fix**: Verify if manager/dispatcher should assign teams

13. **Financial Control Center Role Access**
    - **Location**: `src/App.jsx:324`, `src/pages/admin/FinancialControlCenterAdmin.jsx`
    - **Issue**: Financial Control Center allows admin/manager/dispatcher, but page is read-only
    - **Risk**: No risk, but inconsistent with other operational pages
    - **Fix**: Consider if manager/dispatcher should see financial data

14. **Payment Recording Role Check**
    - **Location**: `supabase/migrations/20260124190000_payments_ledger_overhaul.sql:117`
    - **Issue**: `record_payment` RPC allows admin/crew only, but PaymentsAdmin page is admin-only
    - **Risk**: Crew can record payments via RPC but can't access PaymentsAdmin page
    - **Fix**: Verify if crew should access PaymentsAdmin or if RPC should be admin-only

### P2 - Polish / Cleanup

15. **Navbar Admin Dropdown**
    - **Location**: `src/Navbar.jsx:105-135`
    - **Issue**: Navbar shows admin dropdown for admin role, but sidebar navigation also exists
    - **Risk**: Duplicate navigation, minor UX confusion
    - **Fix**: Consider removing navbar admin dropdown if sidebar is primary navigation

16. **Deprecated Routes**
    - **Location**: `src/App.jsx:146-148, 240-242, 333`
    - **Issue**: Redirect routes exist for deprecated paths (`/admin/jobs/needs-scheduling`, `/admin/schedule/requests`, `/admin/reports`)
    - **Risk**: No security risk, but indicates technical debt
    - **Fix**: Keep redirects for backward compatibility or remove if no longer needed

17. **Root Redirect Logic**
    - **Location**: `src/components/RootRedirect.jsx:28-29`
    - **Issue**: Manager/dispatcher redirect to `/admin/revenue-hub`, but they can access other pages
    - **Risk**: Minor UX issue, users may not discover other available pages
    - **Fix**: Consider redirecting to a manager/dispatcher dashboard or showing available pages

18. **Login Redirect Logic**
    - **Location**: `src/Login.jsx:24-25`
    - **Issue**: Manager/dispatcher redirect to `/admin/revenue-hub` after login
    - **Risk**: Same as root redirect
    - **Fix**: Align with root redirect logic

19. **Platform Admin Support Mode Navigation**
    - **Location**: `src/components/nav/navConfig.js:143-230`
    - **Issue**: Platform admin in support mode sees full admin nav, but mutations are disabled
    - **Risk**: Minor UX issue, navigation doesn't indicate read-only state
    - **Fix**: Add visual indicator or filter out mutation-heavy nav items in support mode

---

## Detailed Findings by Area

### 1. Route Protection

#### ProtectedRoute Component
**File**: `src/ProtectedRoute.jsx`

**Behavior**:
- Checks `allowedRoles` array against user `role`
- Special case: `platform_admin` in `supportMode` can access routes with `allowedRoles.includes('admin')`
- Redirects to login if unauthorized

**Findings**:
- ✅ Route protection is consistent
- ⚠️ Support mode special case may allow access to pages that should be admin-only (e.g., BillingAdmin)
- ⚠️ No distinction between read-only support mode and full admin access

#### Route Definitions
**File**: `src/App.jsx`

**Admin-Only Routes** (confirmed):
- `/admin` - Dashboard
- `/admin/jobs` - Jobs
- `/admin/payments` - Payments
- `/admin/expenses` - Expenses
- `/admin/settings` - Settings
- `/admin/billing` - Billing
- `/admin/recurring-jobs` - Recurring Jobs
- `/admin/customers` - Customers
- `/admin/crew` - Crew
- `/admin/teams` - Teams
- `/admin/schedule` - Schedule
- `/admin/quotes` - Quotes
- `/admin/quotes/new` - New Quote
- `/admin/quotes/:id` - Quote Detail
- `/admin/onboarding` - Onboarding

**Admin/Manager/Dispatcher Routes** (confirmed):
- `/admin/revenue-hub` - Revenue Hub
- `/admin/route-planning` - Route Planning
- `/admin/dispatch-center` - Dispatch Center
- `/admin/scheduling-center` - Scheduling Center
- `/admin/job-intelligence` - Job Intelligence
- `/admin/financial-control-center` - Financial Control Center

**Crew Routes**:
- `/crew` - Crew Dashboard (allows `crew` and `admin`)
- `/crew/jobs` - Crew Jobs (allows `crew` and `admin`)
- `/crew/job/:id` - Crew Job Detail (allows `crew` and `admin`)
- `/crew/help` - Crew Help (allows `crew` and `admin`)

**Customer Routes**:
- `/customer/*` - All customer portal routes (allows `customer` only)

**Platform Admin Routes**:
- `/platform` - Platform Dashboard (allows `platform_admin` only)
- `/platform/companies` - Platform Companies (allows `platform_admin` only)
- `/platform/company/:id` - Platform Company Detail (allows `platform_admin` only)

**Issues**:
1. **Manager/Dispatcher Access**: 6 operational pages allow manager/dispatcher, but navigation only shows Revenue Hub
2. **Crew Portal Admin Access**: Admin can access crew portal routes (may be intentional)
3. **Support Mode Access**: Platform admin in support mode can access all admin routes via ProtectedRoute special case

### 2. Navigation Visibility

#### Navigation Configuration
**File**: `src/components/nav/navConfig.js`

**Admin Navigation** (confirmed):
- Dashboard, Jobs, Customers, Quotes, Revenue Hub, Crew, Teams, Payments, Expenses, Recurring Jobs, Schedule, Dispatch Center, Scheduling Center, Job Intelligence, Financial Control Center, Settings, Billing, Worker Portal

**Manager/Dispatcher Navigation** (confirmed):
- Revenue Hub only

**Crew Navigation** (confirmed):
- Worker Portal only

**Customer Navigation** (confirmed):
- Customer Portal only

**Platform Admin Navigation** (confirmed):
- If in support mode: Full admin navigation
- If not in support mode: Platform Dashboard, Companies

**Issues**:
1. **Manager/Dispatcher Mismatch**: Can access 6 pages via routes but nav only shows Revenue Hub
2. **Platform Admin Support Mode**: Sees full admin nav but mutations are disabled (no visual indicator)

#### Navbar Component
**File**: `src/Navbar.jsx`

**Behavior**:
- Shows admin dropdown for admin role
- Shows crew link for crew and admin roles
- Shows dashboard link based on role

**Issues**:
1. **Duplicate Navigation**: Admin dropdown in navbar overlaps with sidebar navigation
2. **No Manager/Dispatcher Nav**: Manager/dispatcher don't see operational pages in navbar

### 3. Page-Level Action Entitlements

#### JobsAdmin
**File**: `src/pages/admin/JobsAdmin.jsx`
**Route Protection**: Admin only
**Mutations**: Create, update, delete jobs
**Support Mode**: Mutations disabled via `supportMode` checks

**Findings**:
- ✅ Route protection is admin-only
- ✅ Support mode disables mutations
- ⚠️ No internal role check beyond route protection

#### CustomersAdmin
**File**: `src/pages/admin/CustomersAdmin.jsx`
**Route Protection**: Admin only
**Mutations**: Create, update, delete customers; create jobs
**Support Mode**: Mutations disabled via `supportMode` checks

**Findings**:
- ✅ Route protection is admin-only
- ✅ Support mode disables mutations
- ⚠️ No internal role check beyond route protection

#### BillingAdmin
**File**: `src/pages/admin/BillingAdmin.jsx`
**Route Protection**: Admin only (but support mode can access via ProtectedRoute special case)
**Mutations**: Start checkout, open billing portal, reconcile billing
**Support Mode**: Mutations disabled via `supportMode` checks

**Findings**:
- ⚠️ **P0 Issue**: Platform admin in support mode can access page, but Edge Functions reject support mode
- ✅ Support mode disables mutations in UI
- ⚠️ `canReconcile` check allows platform_admin in support mode, but Edge Function also checks support mode

#### Settings
**File**: `src/pages/admin/Settings.jsx`
**Route Protection**: Admin only
**Mutations**: Update company settings, upload logo, toggle auto-generate recurring jobs
**Support Mode**: No explicit support mode checks

**Findings**:
- ⚠️ **P0 Issue**: No internal role check beyond route protection
- ⚠️ No support mode checks (may allow mutations in support mode)

#### RevenueHub
**File**: `src/pages/admin/RevenueHub.jsx`
**Route Protection**: Admin, manager, dispatcher
**Mutations**: Various revenue/collections actions
**Support Mode**: Not checked

**Findings**:
- ⚠️ **P1 Issue**: Manager/dispatcher can access, but page may have admin-only mutations
- ⚠️ No role-based action gating visible
- ⚠️ No support mode checks

#### RoutePlanningAdmin
**File**: `src/pages/admin/RoutePlanningAdmin.jsx`
**Route Protection**: Admin, manager, dispatcher
**Mutations**: Generate routes
**Support Mode**: Not checked

**Findings**:
- ⚠️ **P1 Issue**: Manager/dispatcher can access, but page has no role checks
- ⚠️ No support mode checks

#### DispatchCenterAdmin
**File**: `src/pages/admin/DispatchCenterAdmin.jsx`
**Route Protection**: Admin, manager, dispatcher
**Mutations**: Assign teams to jobs
**Support Mode**: Not checked

**Findings**:
- ⚠️ **P1 Issue**: Manager/dispatcher can assign teams (may be intentional)
- ⚠️ No support mode checks

#### SchedulingCenterAdmin
**File**: `src/pages/admin/SchedulingCenterAdmin.jsx`
**Route Protection**: Admin, manager, dispatcher
**Mutations**: Generate jobs from recurring, generate routes
**Support Mode**: Not checked

**Findings**:
- ⚠️ **P1 Issue**: Manager/dispatcher can generate jobs (RPC allows it)
- ⚠️ No support mode checks

#### JobIntelligenceAdmin
**File**: `src/pages/admin/JobIntelligenceAdmin.jsx`
**Route Protection**: Admin, manager, dispatcher
**Mutations**: Assign teams to jobs
**Support Mode**: Not checked

**Findings**:
- ⚠️ **P1 Issue**: Manager/dispatcher can assign teams (may be intentional)
- ⚠️ No support mode checks

#### FinancialControlCenterAdmin
**File**: `src/pages/admin/FinancialControlCenterAdmin.jsx`
**Route Protection**: Admin, manager, dispatcher
**Mutations**: None (read-only)
**Support Mode**: Not checked

**Findings**:
- ✅ Read-only page, no mutations
- ⚠️ Manager/dispatcher can see financial data (may be intentional)

#### PaymentsAdmin
**File**: `src/pages/admin/PaymentsAdmin.jsx`
**Route Protection**: Admin only
**Mutations**: Record payments, void payments
**Support Mode**: Mutations disabled via `supportMode` checks

**Findings**:
- ✅ Route protection is admin-only
- ✅ Support mode disables mutations
- ⚠️ **P1 Issue**: `record_payment` RPC allows crew, but page is admin-only

### 4. Backend Entitlement Alignment

#### RPC Role Checks

**generate_jobs_from_recurring**:
- **File**: `supabase/migrations/20260317000000_generate_jobs_from_recurring_rpc.sql:49`
- **Allowed Roles**: admin, manager, dispatcher
- **Frontend**: SchedulingCenterAdmin (allows admin, manager, dispatcher)
- **Status**: ✅ Aligned

**record_payment**:
- **File**: `supabase/migrations/20260124190000_payments_ledger_overhaul.sql:117`
- **Allowed Roles**: admin, crew
- **Frontend**: PaymentsAdmin (admin only), Crew portal (crew)
- **Status**: ⚠️ **P1 Issue**: RPC allows crew, but PaymentsAdmin page is admin-only. Crew can record payments via RPC but can't access PaymentsAdmin page.

**route_runs RLS**:
- **File**: `supabase/migrations/20260316000000_route_optimization_foundation.sql:137`
- **Allowed Roles**: admin, manager, dispatcher (SELECT, INSERT, UPDATE, DELETE)
- **Frontend**: RoutePlanningAdmin (allows admin, manager, dispatcher)
- **Status**: ✅ Aligned

#### Edge Function Role Checks

**create-billing-checkout-session**:
- **File**: `supabase/functions/create-billing-checkout-session/index.ts:109-121`
- **Allowed Roles**: admin only
- **Support Mode**: Rejected
- **Frontend**: BillingAdmin (admin only, but support mode can access page)
- **Status**: ⚠️ **P0 Issue**: Support mode can access page but Edge Function rejects support mode

**create-billing-portal-session**:
- **File**: `supabase/functions/create-billing-portal-session/index.ts:83-95`
- **Allowed Roles**: admin only
- **Support Mode**: Rejected
- **Frontend**: BillingAdmin (admin only, but support mode can access page)
- **Status**: ⚠️ **P0 Issue**: Same as checkout session

**reconcile-billing**:
- **File**: `supabase/functions/reconcile-billing/index.ts:135-156`
- **Allowed Roles**: admin (own company) OR platform_admin (in support mode for target company)
- **Frontend**: BillingAdmin (checks `canReconcile = role === 'admin' || (role === 'platform_admin' && supportMode)`)
- **Status**: ✅ Aligned (but verify exact logic match)

### 5. Billing/Admin/Support Special Attention

#### Billing Access
- **Route**: `/admin/billing` - Admin only (but support mode can access via ProtectedRoute)
- **Navigation**: Admin nav only
- **Page**: BillingAdmin - No internal role check beyond route
- **Edge Functions**: Admin only, support mode rejected
- **Issue**: **P0** - Support mode can access page but actions fail

#### Settings Access
- **Route**: `/admin/settings` - Admin only
- **Navigation**: Admin nav only
- **Page**: Settings - No internal role check, no support mode checks
- **Issue**: **P0** - No internal role check beyond route

#### Support Mode Behavior
- **Platform Admin**: Can start support session for target company
- **ProtectedRoute**: Allows platform_admin in support mode to access admin routes
- **UI Mutations**: Disabled via `supportMode` checks in JobsAdmin, CustomersAdmin, PaymentsAdmin, BillingAdmin
- **Edge Functions**: Reject support mode for billing actions
- **Navigation**: Shows full admin nav in support mode
- **Issue**: **P0** - Navigation doesn't indicate read-only state, billing actions fail

---

## Recommended Fixes in Priority Order

### P0 - Launch Blockers

1. **Fix Support Mode Billing Access**
   - **Option A**: Block BillingAdmin route for support mode in ProtectedRoute
   - **Option B**: Allow support mode in billing Edge Functions (read-only reconciliation only)
   - **Recommendation**: Option A - Block route access, keep Edge Functions admin-only

2. **Fix Manager/Dispatcher Navigation**
   - Add manager/dispatcher nav items for: Route Planning, Dispatch Center, Scheduling Center, Job Intelligence, Financial Control Center
   - OR restrict routes to admin-only if manager/dispatcher shouldn't access these pages
   - **Recommendation**: Add nav items if manager/dispatcher should access these pages

3. **Add Settings Page Role Check**
   - Add role check at page level: `if (role !== 'admin') return <Navigate to="/admin" />`
   - Add support mode check to disable mutations
   - **Recommendation**: Add both checks

4. **Verify Billing Reconciliation Authorization**
   - Ensure UI `canReconcile` logic exactly matches Edge Function authorization
   - **Recommendation**: Extract authorization logic to shared utility

5. **Clarify Crew Portal Admin Access**
   - Document if admin access to crew portal is intentional
   - If not intentional, restrict crew portal routes to crew role only
   - **Recommendation**: Keep admin access if intentional, document it

6. **Add Support Mode Visual Indicator**
   - Add banner/indicator in navigation or page header when in support mode
   - **Recommendation**: Add "Support Mode - Read Only" banner

### P1 - Serious Inconsistencies

7. **Align Manager/Dispatcher Backend RPC Access**
   - If manager/dispatcher should access RPCs, expose them in UI
   - If not, restrict RPCs to admin-only
   - **Recommendation**: Audit each RPC and align with UI access

8. **Audit Revenue Hub Role Actions**
   - Review RevenueHub page for role-appropriate action gating
   - Add role checks for admin-only mutations
   - **Recommendation**: Gate admin-only mutations

9. **Verify Route Planning Manager/Dispatcher Access**
   - Confirm if manager/dispatcher should have full route planning access
   - If yes, document it; if no, restrict to admin-only
   - **Recommendation**: Keep access if intentional, add role checks for sensitive actions

10. **Verify Dispatch Center Manager/Dispatcher Access**
    - Confirm if manager/dispatcher should assign teams
    - If yes, document it; if no, restrict team assignment to admin-only
    - **Recommendation**: Keep access if intentional, document it

11. **Verify Scheduling Center Manager/Dispatcher Access**
    - Confirm if manager/dispatcher should generate jobs
    - If yes, document it; if no, restrict job generation to admin-only
    - **Recommendation**: Keep access if intentional, document it

12. **Verify Job Intelligence Manager/Dispatcher Access**
    - Confirm if manager/dispatcher should assign teams
    - If yes, document it; if no, restrict team assignment to admin-only
    - **Recommendation**: Keep access if intentional, document it

13. **Verify Financial Control Center Manager/Dispatcher Access**
    - Confirm if manager/dispatcher should see financial data
    - If yes, document it; if no, restrict to admin-only
    - **Recommendation**: Keep access if read-only, document it

14. **Align Payment Recording Role Check**
    - If crew should record payments, expose PaymentsAdmin page to crew
    - If not, restrict `record_payment` RPC to admin-only
    - **Recommendation**: Keep crew access via RPC, don't expose PaymentsAdmin page to crew

### P2 - Polish

15. **Remove Navbar Admin Dropdown** (if sidebar is primary)
16. **Clean Up Deprecated Routes** (or document why they exist)
17. **Improve Root Redirect Logic** for manager/dispatcher
18. **Align Login Redirect Logic** with root redirect
19. **Add Support Mode Navigation Indicator**

---

## Conclusion

The audit identified several critical inconsistencies between route protection, navigation visibility, page-level actions, and backend authorization. The most critical issues involve support mode billing access, manager/dispatcher navigation mismatch, and missing internal role checks on sensitive pages.

**Recommendation**: Address all P0 issues before launch, prioritize P1 issues for post-launch hotfixes, and schedule P2 items for next sprint.

---

**Audit Completed By**: AI Assistant  
**Review Status**: Ready for Engineering Review
