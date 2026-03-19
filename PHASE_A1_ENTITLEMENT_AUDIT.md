# Phase A.1: Billing-State Entitlement Audit

**Date:** 2024-03-XX  
**Scope:** Read-only audit of billing-state access rules for admin/manager/dispatcher roles  
**Target Behavior:** 
- `active` = write allowed
- `trialing` = write allowed  
- `past_due` = write allowed
- `unpaid` = read-only
- `canceled` = read-only

---

## Executive Summary

**CRITICAL FINDING:** The codebase has **NO active billing-state gating** for write operations. All admin/manager/dispatcher users can perform mutations regardless of subscription status (`unpaid`, `canceled`, etc.).

**Current State:**
- Billing status is tracked and displayed in UI
- No enforcement exists at route, page, hook, utility, RPC, or edge function levels
- One unreachable billing check exists in `OnboardingGuard.jsx` (dead code after return statement)
- All write operations are currently unrestricted by billing state

**Risk Level:** P0 - Launch Blocker  
**Impact:** Users with `unpaid` or `canceled` subscriptions can create/modify/delete jobs, customers, crew, payments, invoices, quotes, expenses, routes, and all other data.

---

## A. Current Enforcement Map

### A.1 Route Protection

| File | Component/Function | Current Behavior | Roles Affected | Billing Status Handled |
|------|-------------------|------------------|----------------|------------------------|
| `src/ProtectedRoute.jsx` | `ProtectedRoute` | Checks role only (`allowedRoles`). No billing status check. | All roles | None |
| `src/components/OnboardingGuard.jsx` | `OnboardingGuard` | **UNREACHABLE CODE:** Lines 106-171 contain billing status check logic, but it's after a return statement (line 104). This code never executes. | admin only (if it ran) | Would check: `trialing`, `active`, grace window |

**Finding:** Route protection is role-based only. No billing-state enforcement.

---

### A.2 App Shell / Layout Level

| File | Component/Function | Current Behavior | Roles Affected | Billing Status Handled |
|------|-------------------|------------------|----------------|------------------------|
| `src/layouts/AppShell.jsx` | `AppShell` | No billing checks. Only renders `SupportModeBanner`. | All roles | None |
| `src/components/SupportModeBanner.jsx` | `SupportModeBanner` | Shows support mode indicator only. No billing status. | platform_admin | None |

**Finding:** No layout-level billing banners or lock states.

---

### A.3 Page-Level Gating

| File | Page | Current Behavior | Roles Affected | Billing Status Handled |
|------|------|------------------|----------------|------------------------|
| `src/pages/admin/BillingAdmin.jsx` | Billing | Displays subscription status. Blocks checkout/portal in support mode only. No write restrictions. | admin, platform_admin (support) | Display only |
| `src/pages/admin/Settings.jsx` | Settings | Blocks logo upload in support mode. No billing status checks. | admin | None |
| `src/pages/admin/JobsAdmin.jsx` | Jobs | No billing checks. All mutations allowed. | admin, manager, dispatcher | None |
| `src/pages/admin/CustomersAdmin.jsx` | Customers | No billing checks. All mutations allowed. | admin, manager, dispatcher | None |
| `src/pages/admin/CrewAdmin.jsx` | Crew | No billing checks. All mutations allowed. | admin | None |
| `src/pages/admin/TeamsAdmin.jsx` | Teams | No billing checks. All mutations allowed. | admin | None |
| `src/pages/admin/PaymentsAdmin.jsx` | Payments | No billing checks. All mutations allowed. | admin | None |
| `src/pages/admin/ExpensesAdmin.jsx` | Expenses | No billing checks. All mutations allowed. | admin | None |
| `src/pages/admin/QuotesAdmin.jsx` | Quotes | No billing checks. All mutations allowed. | admin | None |
| `src/pages/admin/RecurringJobsAdmin.jsx` | Recurring Jobs | No billing checks. All mutations allowed. | admin | None |
| `src/pages/admin/RoutePlanningAdmin.jsx` | Route Planning | No billing checks. All mutations allowed. | admin, manager, dispatcher | None |
| `src/pages/admin/DispatchCenterAdmin.jsx` | Dispatch Center | No billing checks. All mutations allowed. | admin, manager, dispatcher | None |
| `src/pages/admin/SchedulingCenterAdmin.jsx` | Scheduling Center | No billing checks. All mutations allowed. | admin, manager, dispatcher | None |
| `src/pages/admin/JobIntelligenceAdmin.jsx` | Job Intelligence | No billing checks. All mutations allowed. | admin, manager, dispatcher | None |
| `src/pages/admin/FinancialControlCenterAdmin.jsx` | Financial Control Center | No billing checks. Read-only page. | admin, manager, dispatcher | None |
| `src/pages/admin/RevenueHub.jsx` | Revenue Hub | No billing checks. All mutations allowed. | admin, manager, dispatcher | None |

**Finding:** Zero page-level billing-state enforcement. All admin pages allow full write access regardless of subscription status.

---

### A.4 Reusable Hooks/Utilities

| File | Hook/Utility | Current Behavior | Roles Affected | Billing Status Handled |
|------|-------------|------------------|----------------|------------------------|
| `src/hooks/usePlanLimits.js` | `usePlanLimits` | Fetches plan limits and usage. No billing status checks. | All roles | None |
| `src/context/UserContext.jsx` | `useUser` | Exposes `subscriptionStatus`, `plan`, `trialEndsAt`, `billingGraceUntil` in context. Does not enforce restrictions. | All roles | Exposed but not enforced |

**Finding:** No hooks or utilities that check billing state before allowing writes.

---

### A.5 Write Action Flows

#### Jobs
- **Create:** `src/pages/admin/JobsAdmin.jsx` - Direct `supabase.from('jobs').insert()` - No billing check
- **Update:** `src/pages/admin/JobsAdmin.jsx` - Direct `supabase.from('jobs').update()` - No billing check
- **Delete:** `src/pages/admin/JobsAdmin.jsx` - Direct `supabase.from('jobs').delete()` - No billing check

#### Customers
- **Create:** `src/pages/admin/CustomersAdmin.jsx` - Direct `supabase.from('customers').insert()` - No billing check
- **Update:** `src/pages/admin/CustomersAdmin.jsx` - Direct `supabase.from('customers').update()` - No billing check
- **Delete:** `src/pages/admin/CustomersAdmin.jsx` - Direct `supabase.from('customers').delete()` - No billing check

#### Crew
- **Create:** `src/pages/admin/CrewAdmin.jsx` - Direct `supabase.from('crew_members').insert()` - No billing check
- **Update:** `src/pages/admin/CrewAdmin.jsx` - Direct `supabase.from('crew_members').update()` - No billing check
- **Delete:** `src/pages/admin/CrewAdmin.jsx` - Direct `supabase.from('crew_members').delete()` - No billing check

#### Teams
- **Create/Update/Delete:** `src/pages/admin/TeamsAdmin.jsx` - Direct Supabase mutations - No billing check

#### Payments
- **Create:** `src/pages/admin/PaymentsAdmin.jsx` - Direct `supabase.from('payments').insert()` - No billing check
- **RPC:** `supabase.rpc('record_payment')` - No billing status check in RPC

#### Expenses
- **Create/Update/Delete:** `src/pages/admin/ExpensesAdmin.jsx` - Direct Supabase mutations - No billing check

#### Quotes
- **Create/Update/Delete:** `src/pages/admin/QuotesAdmin.jsx` - Direct Supabase mutations - No billing check

#### Recurring Jobs
- **Create/Update/Delete:** `src/pages/admin/RecurringJobsAdmin.jsx` - Direct Supabase mutations - No billing check
- **Generate Jobs:** `supabase.rpc('generate_jobs_from_recurring')` - No billing status check in RPC

#### Routes
- **Create/Update/Delete:** `src/pages/admin/RoutePlanningAdmin.jsx` - Direct Supabase mutations - No billing check
- **Generate Routes:** `supabase.rpc('generate_team_route_for_day')` - No billing status check in RPC

**Finding:** All write operations bypass billing-state checks. Direct Supabase client calls and RPCs do not validate subscription status.

---

### A.6 Billing and Settings Pages

| File | Page | Current Behavior | Roles Affected | Billing Status Handled |
|------|------|------------------|----------------|------------------------|
| `src/pages/admin/BillingAdmin.jsx` | Billing | - Displays subscription status<br>- Blocks checkout/portal in support mode<br>- Allows reconciliation in support mode<br>- **No write restrictions based on billing state** | admin, platform_admin (support) | Display only, no enforcement |
| `src/pages/admin/Settings.jsx` | Settings | - Blocks logo upload in support mode<br>- **No billing status checks**<br>- All other mutations allowed | admin | None |

**Finding:** Billing page is informational only. Settings page has no billing checks.

---

### A.7 Support Mode Interactions

| File | Component/Function | Current Behavior | Roles Affected | Billing Status Handled |
|------|-------------------|------------------|----------------|------------------------|
| `src/pages/admin/BillingAdmin.jsx` | Billing (support mode) | Blocks checkout/portal. Allows reconciliation. | platform_admin | Support mode only, not billing status |
| `src/pages/admin/Settings.jsx` | Settings (support mode) | Blocks logo upload. | platform_admin | Support mode only, not billing status |
| `src/pages/admin/RoutePlanningAdmin.jsx` | Route Planning (support mode) | Blocks route generation. | platform_admin | Support mode only, not billing status |
| `src/pages/admin/DispatchCenterAdmin.jsx` | Dispatch Center (support mode) | Blocks team assignment. | platform_admin | Support mode only, not billing status |
| `src/pages/admin/SchedulingCenterAdmin.jsx` | Scheduling Center (support mode) | Blocks job generation. | platform_admin | Support mode only, not billing status |
| `src/pages/admin/JobIntelligenceAdmin.jsx` | Job Intelligence (support mode) | Blocks team assignment. | platform_admin | Support mode only, not billing status |

**Finding:** Support mode blocks mutations, but this is role-based (platform_admin), not billing-status-based. Billing status is not checked in support mode.

---

### A.8 Edge Functions and RPCs

| File | Function/RPC | Current Behavior | Roles Affected | Billing Status Handled |
|------|-------------|------------------|----------------|------------------------|
| `supabase/functions/create-billing-checkout-session/index.ts` | `create-billing-checkout-session` | Reads subscription status for display. Does not block based on status. | admin | Read only |
| `supabase/functions/stripe-webhook/index.ts` | `stripe-webhook` | Updates subscription status. Does not enforce restrictions. | System | Updates status only |
| `supabase/functions/reconcile-billing/index.ts` | `reconcile-billing` | Reads and updates subscription status. Does not enforce restrictions. | admin, platform_admin | Updates status only |
| `supabase/migrations/20260124190000_payments_ledger_overhaul.sql` | `record_payment()` RPC | Checks role (`admin`, `crew`). **No subscription status check.** | admin, crew | None |
| `supabase/migrations/20260124190000_payments_ledger_overhaul.sql` | `void_payment()` RPC | Checks role (`admin`). **No subscription status check.** | admin | None |
| `supabase/migrations/20260317000000_generate_jobs_from_recurring_rpc.sql` | `generate_jobs_from_recurring()` RPC | Checks role (`admin`). **No subscription status check.** | admin | None |
| All other RPCs | Various | Role checks only. No billing status checks. | Various | None |

**Finding:** Edge functions and RPCs check roles but never check subscription status before allowing mutations.

---

### A.9 SQL Policies, Triggers, RPCs

| File | Policy/Trigger/RPC | Current Behavior | Roles Affected | Billing Status Handled |
|------|-------------------|------------------|----------------|------------------------|
| All RLS policies | Various | Tenant-scoped (`company_id`). Role-based. **No subscription status checks.** | All roles | None |
| All triggers | Various | Data integrity only. **No subscription status checks.** | N/A | None |
| All RPCs | Various | Role checks only. **No subscription status checks.** | Various | None |

**Finding:** Database layer has no billing-state enforcement. All policies and RPCs are role/tenant-scoped only.

---

## B. Inconsistency Matrix

### B.1 Route Access

| Role | active | trialing | past_due | unpaid | canceled |
|------|--------|----------|----------|--------|----------|
| admin | ✅ Full access | ✅ Full access | ✅ Full access | ✅ Full access | ✅ Full access |
| manager | ✅ Full access | ✅ Full access | ✅ Full access | ✅ Full access | ✅ Full access |
| dispatcher | ✅ Full access | ✅ Full access | ✅ Full access | ✅ Full access | ✅ Full access |

**Current Behavior:** All roles have full route access regardless of subscription status.  
**Target Behavior:** `unpaid` and `canceled` should be read-only (billing/settings routes only).

---

### B.2 Page Access

| Role | active | trialing | past_due | unpaid | canceled |
|------|--------|----------|----------|--------|----------|
| admin | ✅ All pages | ✅ All pages | ✅ All pages | ✅ All pages | ✅ All pages |
| manager | ✅ All pages | ✅ All pages | ✅ All pages | ✅ All pages | ✅ All pages |
| dispatcher | ✅ All pages | ✅ All pages | ✅ All pages | ✅ All pages | ✅ All pages |

**Current Behavior:** All roles can access all pages regardless of subscription status.  
**Target Behavior:** `unpaid` and `canceled` should redirect to billing page or show read-only banner.

---

### B.3 Write Actions

| Role | active | trialing | past_due | unpaid | canceled |
|------|--------|----------|----------|--------|----------|
| admin | ✅ Allowed | ✅ Allowed | ✅ Allowed | ❌ **Should block** | ❌ **Should block** |
| manager | ✅ Allowed | ✅ Allowed | ✅ Allowed | ❌ **Should block** | ❌ **Should block** |
| dispatcher | ✅ Allowed | ✅ Allowed | ✅ Allowed | ❌ **Should block** | ❌ **Should block** |

**Current Behavior:** All roles can perform all write operations regardless of subscription status.  
**Target Behavior:** `unpaid` and `canceled` should block all mutations.

---

### B.4 Billing Page Access

| Role | active | trialing | past_due | unpaid | canceled |
|------|--------|----------|----------|--------|----------|
| admin | ✅ Access | ✅ Access | ✅ Access | ✅ Access | ✅ Access |
| manager | ❌ No access | ❌ No access | ❌ No access | ❌ No access | ❌ No access |
| dispatcher | ❌ No access | ❌ No access | ❌ No access | ❌ No access | ❌ No access |

**Current Behavior:** Only admin can access billing page (role-based). Billing status does not affect access.  
**Target Behavior:** Should remain role-based. Billing status should not affect billing page access (users need to see billing to resolve issues).

---

### B.5 Manage Billing Access

| Role | active | trialing | past_due | unpaid | canceled |
|------|--------|----------|----------|--------|----------|
| admin | ✅ Checkout/Portal | ✅ Checkout/Portal | ✅ Checkout/Portal | ✅ Checkout/Portal | ✅ Checkout/Portal |
| manager | ❌ No access | ❌ No access | ❌ No access | ❌ No access | ❌ No access |
| dispatcher | ❌ No access | ❌ No access | ❌ No access | ❌ No access | ❌ No access |

**Current Behavior:** Only admin can start checkout/open portal (role-based). Billing status does not affect access.  
**Target Behavior:** Should remain role-based. Billing status should not affect billing actions (users need to pay to resolve `unpaid`/`canceled`).

---

### B.6 Banner / Warning Behavior

| Role | active | trialing | past_due | unpaid | canceled |
|------|--------|----------|----------|--------|----------|
| admin | None | None | None | ❌ **Should show** | ❌ **Should show** |
| manager | None | None | None | ❌ **Should show** | ❌ **Should show** |
| dispatcher | None | None | None | ❌ **Should show** | ❌ **Should show** |

**Current Behavior:** No billing-status banners exist.  
**Target Behavior:** `unpaid` and `canceled` should show persistent banner warning about read-only mode and link to billing.

---

## C. Bypass Inventory

### C.1 Pages Reachable When They Should Not Be

**Finding:** All admin pages are reachable regardless of subscription status. No redirects or blocks exist for `unpaid`/`canceled` users.

**Affected Pages:**
- All admin pages (Jobs, Customers, Crew, Teams, Payments, Expenses, Quotes, Recurring Jobs, Routes, Scheduling, Dispatch, Intelligence, Finance, Revenue Hub)

**Expected Behavior:** `unpaid`/`canceled` users should be redirected to billing page or see read-only banner.

---

### C.2 Writes Possible When They Should Be Blocked

**Finding:** All write operations are allowed regardless of subscription status.

**Affected Operations:**
1. **Jobs:** Create, update, delete, status changes
2. **Customers:** Create, update, delete
3. **Crew:** Create, update, delete, password setup
4. **Teams:** Create, update, delete
5. **Payments:** Create, void
6. **Expenses:** Create, update, delete
7. **Quotes:** Create, update, delete, send
8. **Invoices:** Generate, send
9. **Recurring Jobs:** Create, update, delete, generate jobs
10. **Routes:** Create, update, delete, generate routes
11. **Scheduling:** Generate jobs, assign teams
12. **Settings:** Update company settings, upload logo

**Expected Behavior:** `unpaid`/`canceled` users should see disabled buttons/forms with clear messaging and upgrade CTA.

---

### C.3 Writes Blocked When They Should Be Allowed

**Finding:** None. All writes are currently allowed.

**Expected Behavior:** `active`, `trialing`, and `past_due` should allow writes (current behavior is correct).

---

### C.4 Role Divergence Between Admin/Manager/Dispatcher

**Finding:** No divergence. All three roles have identical access patterns (no billing checks for any role).

**Expected Behavior:** All three roles should follow the same billing-state rules (target behavior is consistent across roles).

---

### C.5 Missing Global Policy Points

**Finding:** No global billing-state policy exists anywhere in the codebase.

**Missing Enforcement Points:**
1. **Route Guard:** `ProtectedRoute.jsx` does not check billing status
2. **Layout/Shell:** `AppShell.jsx` does not show billing banners or lock UI
3. **Page-Level Guards:** No admin pages check billing status before rendering
4. **Hook/Utility:** No `useBillingGate()` or `canWrite()` utility exists
5. **RPC Layer:** No RPCs check subscription status before mutations
6. **Edge Functions:** No edge functions check subscription status before mutations
7. **Database Policies:** No RLS policies check subscription status

**Expected Behavior:** Single source of truth for billing-state gating should exist and be consumed everywhere.

---

### C.6 Duplicate/Conflicting Logic

**Finding:** No duplicate logic exists because no billing checks exist at all.

**Note:** `OnboardingGuard.jsx` contains unreachable billing check code (lines 106-171), but it never executes due to early return on line 104.

---

## D. Recommended Implementation Plan

### D.1 Single Source of Truth

**Recommendation:** Create a reusable hook `src/hooks/useBillingGate.js` that:
- Reads subscription status from `UserContext`
- Exposes `canWrite` boolean based on status
- Exposes `billingStatus`, `isReadOnly`, `upgradeMessage` for UI
- Handles grace window logic (`billing_grace_until`)
- Handles trial logic (`trial_ends_at`)

**Logic:**
```javascript
const canWrite = 
  subscriptionStatus === 'active' || 
  subscriptionStatus === 'trialing' || 
  subscriptionStatus === 'past_due' ||
  (billingGraceUntil && new Date(billingGraceUntil) > new Date());
```

---

### D.2 Implementation Layers

#### Layer 1: Route Guard (Highest Priority)
**File:** `src/ProtectedRoute.jsx`  
**Change:** Add billing status check. Redirect `unpaid`/`canceled` users to `/admin/billing` with query param `?status=readonly`.

**Rationale:** Prevents access to admin pages before users even see them.

---

#### Layer 2: Layout Banner (High Priority)
**File:** `src/layouts/AppShell.jsx` or new component  
**Change:** Show persistent banner for `unpaid`/`canceled` users with message and link to billing.

**Rationale:** Clear UX communication about read-only state.

---

#### Layer 3: Page-Level Guards (Medium Priority)
**Files:** All admin pages  
**Change:** Import `useBillingGate()`. Disable mutation buttons/forms when `canWrite === false`. Show upgrade CTA.

**Rationale:** Defense-in-depth. Prevents mutations even if route guard is bypassed.

---

#### Layer 4: Hook/Utility (Foundation)
**File:** `src/hooks/useBillingGate.js` (new)  
**Change:** Create hook as single source of truth.

**Rationale:** Reusable logic for all components.

---

#### Layer 5: RPC Layer (Optional - Defense-in-Depth)
**Files:** Key RPCs (`record_payment`, `generate_jobs_from_recurring`, etc.)  
**Change:** Add subscription status check. Return error if `unpaid`/`canceled`.

**Rationale:** Backend enforcement as final safety net. May be overkill if frontend is properly gated.

---

### D.3 Files to Modify

**High Priority:**
1. `src/hooks/useBillingGate.js` (new)
2. `src/ProtectedRoute.jsx`
3. `src/layouts/AppShell.jsx` (or new banner component)

**Medium Priority:**
4. `src/pages/admin/JobsAdmin.jsx`
5. `src/pages/admin/CustomersAdmin.jsx`
6. `src/pages/admin/CrewAdmin.jsx`
7. `src/pages/admin/TeamsAdmin.jsx`
8. `src/pages/admin/PaymentsAdmin.jsx`
9. `src/pages/admin/ExpensesAdmin.jsx`
10. `src/pages/admin/QuotesAdmin.jsx`
11. `src/pages/admin/RecurringJobsAdmin.jsx`
12. `src/pages/admin/RoutePlanningAdmin.jsx`
13. `src/pages/admin/DispatchCenterAdmin.jsx`
14. `src/pages/admin/SchedulingCenterAdmin.jsx`
15. `src/pages/admin/JobIntelligenceAdmin.jsx`
16. `src/pages/admin/Settings.jsx`

**Low Priority (Optional):**
17. Key RPCs in `supabase/migrations/` (backend defense-in-depth)

---

### D.4 What Should Remain Excluded

**Billing Page Access:**
- `unpaid`/`canceled` users should still access `/admin/billing` to resolve issues
- Billing page should not be blocked by billing status

**Settings Page Access:**
- `unpaid`/`canceled` users may need to access settings (read-only view)
- Settings mutations should be blocked, but page access should remain

**Support Mode:**
- Support mode restrictions should remain independent of billing status
- Platform admin in support mode should not be affected by tenant billing status

**Read-Only Operations:**
- Viewing data (SELECT queries) should remain allowed
- Only mutations (INSERT, UPDATE, DELETE) should be blocked

---

## E. Acceptance Checklist

### E.1 Admin/Manager/Dispatcher Behavior Matrix

- [ ] **Admin with `active`:** Full write access to all pages
- [ ] **Admin with `trialing`:** Full write access to all pages
- [ ] **Admin with `past_due`:** Full write access to all pages
- [ ] **Admin with `unpaid`:** Read-only access. Redirected to billing or shown banner. All mutation buttons disabled.
- [ ] **Admin with `canceled`:** Read-only access. Redirected to billing or shown banner. All mutation buttons disabled.
- [ ] **Manager with `active`:** Full write access to operational pages
- [ ] **Manager with `unpaid`:** Read-only access. Same restrictions as admin.
- [ ] **Dispatcher with `active`:** Full write access to operational pages
- [ ] **Dispatcher with `unpaid`:** Read-only access. Same restrictions as admin.

---

### E.2 Unpaid/Canceled Read-Only Checks

- [ ] Cannot create jobs
- [ ] Cannot update jobs
- [ ] Cannot delete jobs
- [ ] Cannot create customers
- [ ] Cannot update customers
- [ ] Cannot delete customers
- [ ] Cannot create crew
- [ ] Cannot update crew
- [ ] Cannot delete crew
- [ ] Cannot create teams
- [ ] Cannot update teams
- [ ] Cannot delete teams
- [ ] Cannot create payments
- [ ] Cannot void payments
- [ ] Cannot create expenses
- [ ] Cannot update expenses
- [ ] Cannot delete expenses
- [ ] Cannot create quotes
- [ ] Cannot update quotes
- [ ] Cannot delete quotes
- [ ] Cannot generate recurring jobs
- [ ] Cannot generate routes
- [ ] Cannot assign teams
- [ ] Cannot update settings (except read-only view)

---

### E.3 Active/Trialing/Past_Due Write Checks

- [ ] Can create jobs
- [ ] Can update jobs
- [ ] Can delete jobs
- [ ] Can create customers
- [ ] Can update customers
- [ ] Can delete customers
- [ ] Can create crew
- [ ] Can update crew
- [ ] Can delete crew
- [ ] Can create teams
- [ ] Can update teams
- [ ] Can delete teams
- [ ] Can create payments
- [ ] Can void payments
- [ ] Can create expenses
- [ ] Can update expenses
- [ ] Can delete expenses
- [ ] Can create quotes
- [ ] Can update quotes
- [ ] Can delete quotes
- [ ] Can generate recurring jobs
- [ ] Can generate routes
- [ ] Can assign teams
- [ ] Can update settings

---

### E.4 No Route Bypass

- [ ] Direct URL access to `/admin/jobs` with `unpaid` status redirects to billing or shows read-only banner
- [ ] Direct URL access to `/admin/customers` with `unpaid` status redirects to billing or shows read-only banner
- [ ] Direct URL access to `/admin/crew` with `unpaid` status redirects to billing or shows read-only banner
- [ ] Direct URL access to any admin page with `unpaid`/`canceled` status is blocked or shows read-only UI
- [ ] No mutation operations work via direct API calls when billing status is `unpaid`/`canceled` (if RPC layer is implemented)

---

### E.5 Billing Page and Manage Billing Behavior

- [ ] Billing page (`/admin/billing`) is accessible to `unpaid`/`canceled` users
- [ ] Checkout button is enabled for `unpaid`/`canceled` users (they need to pay)
- [ ] Billing portal button is enabled for `unpaid`/`canceled` users (if they have Stripe customer)
- [ ] Billing page shows clear status and upgrade CTA
- [ ] Settings page is accessible but mutations are blocked for `unpaid`/`canceled` users

---

### E.6 Support Mode Preserved Correctly

- [ ] Platform admin in support mode is not affected by tenant billing status
- [ ] Support mode read-only restrictions remain independent of billing status
- [ ] Support mode can still reconcile billing for `unpaid`/`canceled` tenants
- [ ] Support mode can still view all tenant data regardless of billing status

---

## Summary

**Top 5 Inconsistencies:**

1. **P0 - No Billing-State Enforcement:** Zero enforcement exists. All users can write regardless of subscription status.
2. **P0 - Unreachable Code:** `OnboardingGuard.jsx` has billing check logic that never executes (dead code).
3. **P1 - No Route Guard:** `ProtectedRoute.jsx` does not check billing status before allowing route access.
4. **P1 - No Layout Banner:** No persistent banner warns `unpaid`/`canceled` users about read-only mode.
5. **P1 - No Page-Level Guards:** All admin pages allow mutations without checking billing status.

**Next Prompt Recommendation:** **KEEP** - Implementation is ready. The audit is complete and surgical fix plan is clear. Proceed with creating `useBillingGate` hook and implementing route/page-level guards.

---

**Files Referenced:**
- `src/ProtectedRoute.jsx`
- `src/components/OnboardingGuard.jsx`
- `src/layouts/AppShell.jsx`
- `src/context/UserContext.jsx`
- `src/pages/admin/BillingAdmin.jsx`
- `src/pages/admin/Settings.jsx`
- `src/pages/admin/JobsAdmin.jsx`
- `src/pages/admin/CustomersAdmin.jsx`
- `src/pages/admin/CrewAdmin.jsx`
- All other admin pages
- `supabase/functions/*/index.ts`
- `supabase/migrations/*.sql`
