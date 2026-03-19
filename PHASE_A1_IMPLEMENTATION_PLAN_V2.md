# Phase A.1: Billing-State Entitlement Implementation Plan V2

**Date:** 2024-03-XX  
**Status:** Build-Ready Architecture Plan  
**Policy:** Internal admin/manager/dispatcher users follow billing write matrix:
- `active` = write allowed
- `trialing` = write allowed
- `past_due` = write allowed
- `unpaid` = read-only
- `canceled` = read-only

**Key Corrections from V1:**
1. ✅ Read-only mode (NOT redirect-to-billing mode)
2. ✅ Users can navigate admin pages in read-only mode
3. ✅ Billing page remains accessible
4. ✅ Backend enforcement is REQUIRED (not optional)
5. ✅ No extra grace-window rules unless existing code requires them
6. ✅ Focus on internal roles and internal admin mutation surfaces

---

## A. Final Architecture Decision

### A.1 Enforcement Layers

**Layer 1: Shared Billing Policy Utility/Hook** (Foundation)
- **Purpose:** Single source of truth for billing-state evaluation
- **Location:** `src/hooks/useBillingGate.js` (new)
- **Consumption:** All other layers consume this hook
- **Scope:** Internal roles only (`admin`, `manager`, `dispatcher`)

**Layer 2: App Shell / Banner Layer** (UX Communication)
- **Purpose:** Persistent visual indicator of read-only state
- **Location:** `src/components/BillingReadOnlyBanner.jsx` (new) or `src/layouts/AppShell.jsx`
- **Behavior:** Shows banner when `isReadOnly === true`, links to billing page
- **Scope:** All admin pages (via AppShell)

**Layer 3: UI Mutation Guard Pattern** (Frontend Defense)
- **Purpose:** Disable/hide mutation controls when read-only
- **Location:** Each admin page component
- **Pattern:** Reusable helper component or hook wrapper
- **Scope:** All mutation surfaces (buttons, forms, actions)

**Layer 4: Backend Enforcement Layer** (Final Safety Net)
- **Purpose:** RPC/edge function checks before mutations
- **Location:** Key RPCs and edge functions
- **Behavior:** Return error if `unpaid`/`canceled` status detected
- **Scope:** Priority 1 mutation paths (see Section C)

**Layer 5: Route-Level Logic** (NOT NEEDED)
- **Decision:** **REJECTED** - No route-level redirects
- **Rationale:** Users should access pages in read-only mode, not be redirected away
- **Exception:** None. All admin routes remain accessible.

---

### A.2 Architecture Principles

1. **Read-Only Mode, Not Redirect Mode**
   - Users with `unpaid`/`canceled` status can navigate all admin pages
   - Pages render in read-only state (disabled buttons, non-editable forms)
   - Banner provides clear messaging and billing link

2. **Defense-in-Depth**
   - Frontend guards prevent UI actions
   - Backend enforcement prevents API bypass
   - Both layers use same policy logic

3. **Single Source of Truth**
   - `useBillingGate` hook is the only place billing policy is evaluated
   - All other layers consume this hook
   - Policy changes happen in one place

4. **Internal Roles Only**
   - Only `admin`, `manager`, `dispatcher` are affected
   - `crew`, `customer`, `platform_admin` are excluded from billing gating
   - Support mode remains independent

---

## B. Single Source of Truth Design

### B.1 Hook API Contract

**File:** `src/hooks/useBillingGate.js`

**Exports:**
```javascript
// Hook function
export function useBillingGate()

// Returns object with shape:
{
  // Raw billing status from UserContext
  billingStatus: string,  // 'active' | 'trialing' | 'past_due' | 'unpaid' | 'canceled' | 'inactive'
  
  // Derived boolean: true if mutations should be blocked
  isReadOnly: boolean,
  
  // Derived boolean: true if mutations should be allowed
  canWrite: boolean,
  
  // Human-readable reason for read-only state (if applicable)
  readOnlyReason: string | null,  // e.g., "Subscription is unpaid" or null
  
  // Whether user can access billing page (always true for internal roles)
  canAccessBilling: boolean,  // Always true for admin/manager/dispatcher
  
  // Whether billing actions (checkout, portal) should be enabled
  canManageBilling: boolean,  // true for admin, false for manager/dispatcher
  
  // Loading state (if billing status is being fetched)
  isLoading: boolean
}
```

### B.2 Policy Logic

**Write Allowed When:**
- `billingStatus === 'active'` OR
- `billingStatus === 'trialing'` OR
- `billingStatus === 'past_due'`

**Read-Only When:**
- `billingStatus === 'unpaid'` OR
- `billingStatus === 'canceled'`

**Read-Only Reason Messages:**
- `unpaid`: "Subscription is unpaid. Upgrade to continue making changes."
- `canceled`: "Subscription is canceled. Reactivate to continue making changes."

**Note:** No grace window or trial expiration logic unless existing code explicitly requires it. Policy is based solely on `subscription_status` value.

### B.3 Role Scope

**Internal Roles (Affected):**
- `admin` - Full billing gating
- `manager` - Full billing gating
- `dispatcher` - Full billing gating

**Excluded Roles:**
- `crew` - Not affected (crew portal is separate)
- `customer` - Not affected (customer portal is separate)
- `platform_admin` - Not affected (support mode is separate concern)

---

## C. Mutation Surface Inventory

### C.1 Priority 1 (Highest Risk - Must Implement)

#### Jobs
- **Frontend Action Points:**
  - `src/pages/admin/JobsAdmin.jsx`
    - Create job: `supabase.from('jobs').insert()`
    - Update job: `supabase.from('jobs').update()`
    - Delete job: `supabase.from('jobs').delete()`
    - Status changes: `supabase.from('jobs').update({ status })`
- **Backend Mutation Points:**
  - Direct table mutations (RLS enforced, but no billing check)
- **Recommended Guard Method:**
  - Frontend: Disable create/edit/delete buttons when `!canWrite`
  - Backend: Add billing check to RLS policy or create wrapper RPC (if needed)

#### Customers
- **Frontend Action Points:**
  - `src/pages/admin/CustomersAdmin.jsx`
    - Create customer: `supabase.from('customers').insert()`
    - Update customer: `supabase.from('customers').update()`
    - Delete customer: `supabase.from('customers').delete()`
    - Create customer login: `supabase.functions.invoke('create-customer-login')`
    - Set customer password: `supabase.functions.invoke('set-customer-password')`
- **Backend Mutation Points:**
  - Direct table mutations
  - Edge functions: `create-customer-login`, `set-customer-password`
- **Recommended Guard Method:**
  - Frontend: Disable mutation buttons/forms
  - Backend: Add billing check to edge functions

#### Crew
- **Frontend Action Points:**
  - `src/pages/admin/CrewAdmin.jsx`
    - Create crew: `supabase.from('crew_members').insert()`
    - Update crew: `supabase.from('crew_members').update()`
    - Delete crew: `supabase.from('crew_members').delete()`
    - Create crew login: `supabase.functions.invoke('create-crew-login')`
    - Set crew password: `supabase.functions.invoke('set-crew-password')`
- **Backend Mutation Points:**
  - Direct table mutations
  - Edge functions: `create-crew-login`, `set-crew-password`
- **Recommended Guard Method:**
  - Frontend: Disable mutation buttons/forms
  - Backend: Add billing check to edge functions

#### Payments
- **Frontend Action Points:**
  - `src/pages/admin/PaymentsAdmin.jsx`
    - Record payment: `supabase.rpc('record_payment')`
    - Void payment: `supabase.rpc('void_payment')`
- **Backend Mutation Points:**
  - RPC: `record_payment()` (in `supabase/migrations/20260124190000_payments_ledger_overhaul.sql`)
  - RPC: `void_payment()` (in same migration)
- **Recommended Guard Method:**
  - Frontend: Disable payment recording/voiding buttons
  - Backend: **REQUIRED** - Add billing status check to both RPCs

#### Recurring Job Generation
- **Frontend Action Points:**
  - `src/pages/admin/SchedulingCenterAdmin.jsx`
    - Generate jobs: `supabase.rpc('generate_jobs_from_recurring')`
- **Backend Mutation Points:**
  - RPC: `generate_jobs_from_recurring()` (in `supabase/migrations/20260317000000_generate_jobs_from_recurring_rpc.sql`)
- **Recommended Guard Method:**
  - Frontend: Disable generate button
  - Backend: **REQUIRED** - Add billing status check to RPC

#### Route Generation / Dispatch Actions
- **Frontend Action Points:**
  - `src/pages/admin/RoutePlanningAdmin.jsx`
    - Generate route: `supabase.rpc('generate_team_route_for_day')`
  - `src/pages/admin/DispatchCenterAdmin.jsx`
    - Assign team: `supabase.from('jobs').update({ assigned_team_id })`
  - `src/pages/admin/SchedulingCenterAdmin.jsx`
    - Generate today's routes: Multiple `generate_team_route_for_day()` calls
- **Backend Mutation Points:**
  - RPC: `generate_team_route_for_day()` (in route optimization migrations)
  - Direct table mutations for job assignment
- **Recommended Guard Method:**
  - Frontend: Disable generate/assign buttons
  - Backend: **REQUIRED** - Add billing check to `generate_team_route_for_day()` RPC

#### Settings Mutations
- **Frontend Action Points:**
  - `src/pages/admin/Settings.jsx`
    - Update company settings: `supabase.from('companies').update()`
    - Upload logo: `supabase.storage.from('branding').upload()`
- **Backend Mutation Points:**
  - Direct table mutations
  - Storage mutations
- **Recommended Guard Method:**
  - Frontend: Disable save/upload buttons
  - Backend: RLS already enforced, but consider wrapper if needed

---

### C.2 Priority 2 (Lower Risk - Follow-On)

#### Teams
- **Frontend Action Points:**
  - `src/pages/admin/TeamsAdmin.jsx`
    - Create/update/delete teams: Direct Supabase mutations
- **Backend Mutation Points:**
  - Direct table mutations
- **Recommended Guard Method:**
  - Frontend: Disable mutation buttons
  - Backend: RLS enforced

#### Expenses
- **Frontend Action Points:**
  - `src/pages/admin/ExpensesAdmin.jsx`
    - Create/update/delete expenses: Direct Supabase mutations
- **Backend Mutation Points:**
  - Direct table mutations
- **Recommended Guard Method:**
  - Frontend: Disable mutation buttons
  - Backend: RLS enforced

#### Quotes
- **Frontend Action Points:**
  - `src/pages/admin/QuotesAdmin.jsx`
    - Create/update/delete quotes: Direct Supabase mutations
    - Send quote emails: `supabase.functions.invoke('send-quote-emails')`
- **Backend Mutation Points:**
  - Direct table mutations
  - Edge function: `send-quote-emails`
- **Recommended Guard Method:**
  - Frontend: Disable mutation buttons
  - Backend: Add billing check to edge function (if needed)

#### Invoice Actions
- **Frontend Action Points:**
  - `src/pages/admin/JobsAdmin.jsx`, `src/pages/admin/RevenueHub.jsx`
    - Generate invoice: `generateInvoice()` utility
    - Send invoice: Various actions
- **Backend Mutation Points:**
  - Direct table mutations (invoices table)
  - RPCs for invoice creation (if any)
- **Recommended Guard Method:**
  - Frontend: Disable invoice generation/sending
  - Backend: Check invoice-related RPCs if they exist

---

## D. Backend Enforcement Plan

### D.1 Required Backend Hardening (Priority 1)

#### RPC: `record_payment()`
- **File:** `supabase/migrations/20260124190000_payments_ledger_overhaul.sql`
- **Current State:** Checks role (`admin`, `crew`), tenant, assignment. No billing check.
- **Required Change:** Add billing status check after role check, before mutation.
- **Error Code:** `SUBSCRIPTION_UNPAID` or `SUBSCRIPTION_CANCELED`
- **Error Message:** "Cannot record payment. Subscription is unpaid. Please update billing to continue."

#### RPC: `void_payment()`
- **File:** `supabase/migrations/20260124190000_payments_ledger_overhaul.sql`
- **Current State:** Checks role (`admin`), tenant. No billing check.
- **Required Change:** Add billing status check after role check.
- **Error Code:** `SUBSCRIPTION_UNPAID` or `SUBSCRIPTION_CANCELED`
- **Error Message:** "Cannot void payment. Subscription is unpaid. Please update billing to continue."

#### RPC: `generate_jobs_from_recurring()`
- **File:** `supabase/migrations/20260317000000_generate_jobs_from_recurring_rpc.sql`
- **Current State:** Checks role (`admin`), tenant. No billing check.
- **Required Change:** Add billing status check after role check, before job generation.
- **Error Code:** `SUBSCRIPTION_UNPAID` or `SUBSCRIPTION_CANCELED`
- **Error Message:** "Cannot generate jobs. Subscription is unpaid. Please update billing to continue."

#### RPC: `generate_team_route_for_day()`
- **File:** `supabase/migrations/20260316000000_route_optimization_foundation.sql` or related
- **Current State:** Unknown (needs inspection). Likely checks role/tenant only.
- **Required Change:** Add billing status check after role check, before route generation.
- **Error Code:** `SUBSCRIPTION_UNPAID` or `SUBSCRIPTION_CANCELED`
- **Error Message:** "Cannot generate route. Subscription is unpaid. Please update billing to continue."

### D.2 Edge Functions (Priority 1)

#### Edge Function: `create-customer-login`
- **File:** `supabase/functions/create-customer-login/index.ts`
- **Current State:** Creates auth user, links to customer. No billing check.
- **Required Change:** Add billing status check for internal roles before mutation.
- **Error Response:** `{ ok: false, code: 'SUBSCRIPTION_UNPAID', message: '...' }`

#### Edge Function: `set-customer-password`
- **File:** `supabase/functions/set-customer-password/index.ts`
- **Current State:** Sets password for customer auth user. No billing check.
- **Required Change:** Add billing status check for internal roles.
- **Error Response:** `{ ok: false, code: 'SUBSCRIPTION_UNPAID', message: '...' }`

#### Edge Function: `create-crew-login`
- **File:** `supabase/functions/create-crew-login/index.ts`
- **Current State:** Creates auth user, links to crew member. No billing check.
- **Required Change:** Add billing status check for internal roles.
- **Error Response:** `{ ok: false, code: 'SUBSCRIPTION_UNPAID', message: '...' }`

#### Edge Function: `set-crew-password`
- **File:** `supabase/functions/set-crew-password/index.ts`
- **Current State:** Sets password for crew auth user. No billing check.
- **Required Change:** Add billing status check for internal roles.
- **Error Response:** `{ ok: false, code: 'SUBSCRIPTION_UNPAID', message: '...' }`

### D.3 Direct Table Mutations (Current State)

**Finding:** Many admin pages use direct Supabase client calls:
- `supabase.from('jobs').insert()`
- `supabase.from('customers').update()`
- `supabase.from('crew_members').delete()`
- etc.

**Current Protection:** RLS policies enforce tenant isolation and role checks, but do not check billing status.

**Minimum Viable Hardening Strategy for Phase A:**
1. **Frontend guards are primary defense** (disable buttons/forms)
2. **Backend RPCs are hardened** (as listed above)
3. **Direct table mutations rely on RLS** (no billing check in RLS for Phase A)
4. **Rationale:** Frontend + RPC hardening covers 90% of mutation paths. Direct table mutations are lower risk if frontend is properly gated. Can add RLS billing checks in future phase if needed.

**Alternative (If Required):**
- Create wrapper RPCs for high-risk direct mutations (e.g., `create_job_rpc`, `update_customer_rpc`)
- Migrate frontend to use RPCs instead of direct mutations
- Add billing checks to wrapper RPCs
- **Decision:** Defer to post-launch unless audit reveals critical bypass risk

---

## E. Implementation Sequence

### Step 1: Policy Hook/Utility (Foundation)
**File:** `src/hooks/useBillingGate.js` (new)
- Create hook that reads `subscriptionStatus` from `UserContext`
- Implement policy logic (active/trialing/past_due = write, unpaid/canceled = read-only)
- Return API contract as defined in Section B
- Test with different subscription statuses

**Dependencies:** None (uses existing `UserContext`)

**Acceptance:** Hook returns correct `canWrite`/`isReadOnly` for all statuses

---

### Step 2: Banner Component (UX Communication)
**File:** `src/components/BillingReadOnlyBanner.jsx` (new)
- Create banner component that uses `useBillingGate()`
- Show banner when `isReadOnly === true`
- Display `readOnlyReason` message
- Include link to `/admin/billing`
- Style consistently with existing `SupportModeBanner`

**Integration:** Add to `src/layouts/AppShell.jsx` (render above main content)

**Dependencies:** Step 1 complete

**Acceptance:** Banner appears for unpaid/canceled users, links to billing

---

### Step 3: Shared UI Mutation Guard Helper/Pattern
**File:** `src/components/ui/BillingGuard.jsx` (new) or utility pattern
- Create reusable wrapper component or hook pattern
- Wraps mutation buttons/forms
- Disables when `!canWrite`
- Shows tooltip/message when disabled
- Provides consistent UX across all pages

**Alternative Pattern:** Each page uses `useBillingGate()` directly and disables buttons conditionally

**Dependencies:** Step 1 complete

**Acceptance:** Reusable pattern works for disabling any mutation control

---

### Step 4: Highest-Risk Admin Surfaces (Frontend)
**Files:**
1. `src/pages/admin/JobsAdmin.jsx`
2. `src/pages/admin/CustomersAdmin.jsx`
3. `src/pages/admin/CrewAdmin.jsx`
4. `src/pages/admin/PaymentsAdmin.jsx`
5. `src/pages/admin/SchedulingCenterAdmin.jsx`
6. `src/pages/admin/RoutePlanningAdmin.jsx`
7. `src/pages/admin/DispatchCenterAdmin.jsx`
8. `src/pages/admin/Settings.jsx`

**Changes:**
- Import `useBillingGate()`
- Disable all mutation buttons/forms when `!canWrite`
- Show disabled state with tooltip/message
- Use shared guard pattern from Step 3

**Dependencies:** Steps 1, 2, 3 complete

**Acceptance:** All Priority 1 mutation surfaces are gated in frontend

---

### Step 5: Backend Enforcement on Highest-Risk Mutation Paths
**Files:**
1. `supabase/migrations/YYYYMMDDHHMMSS_add_billing_checks_to_record_payment.sql` (new)
2. `supabase/migrations/YYYYMMDDHHMMSS_add_billing_checks_to_void_payment.sql` (new)
3. `supabase/migrations/YYYYMMDDHHMMSS_add_billing_checks_to_generate_jobs.sql` (new)
4. `supabase/migrations/YYYYMMDDHHMMSS_add_billing_checks_to_generate_routes.sql` (new)
5. `supabase/functions/create-customer-login/index.ts`
6. `supabase/functions/set-customer-password/index.ts`
7. `supabase/functions/create-crew-login/index.ts`
8. `supabase/functions/set-crew-password/index.ts`

**Changes:**
- Add billing status check to each RPC/edge function
- Query `companies.subscription_status` for user's company
- Return error if `unpaid` or `canceled`
- Use consistent error codes/messages

**Dependencies:** Step 4 complete (frontend guards in place)

**Acceptance:** All Priority 1 backend mutation paths reject unpaid/canceled requests

---

### Step 6: Follow-On Lower-Risk Surfaces (Frontend)
**Files:**
1. `src/pages/admin/TeamsAdmin.jsx`
2. `src/pages/admin/ExpensesAdmin.jsx`
3. `src/pages/admin/QuotesAdmin.jsx`
4. `src/pages/admin/JobIntelligenceAdmin.jsx` (if it has mutations)
5. Other admin pages with mutations

**Changes:**
- Same pattern as Step 4
- Disable mutation controls when `!canWrite`

**Dependencies:** Steps 1-5 complete

**Acceptance:** All Priority 2 mutation surfaces are gated

---

## F. Acceptance Criteria V2 (Read-Only Mode)

### F.1 Admin/Manager/Dispatcher Behavior Matrix

- [ ] **Admin with `active`:** Full write access to all pages. No banner. All mutation buttons enabled.
- [ ] **Admin with `trialing`:** Full write access to all pages. No banner. All mutation buttons enabled.
- [ ] **Admin with `past_due`:** Full write access to all pages. No banner. All mutation buttons enabled.
- [ ] **Admin with `unpaid`:** Read-only access. Banner visible. All mutation buttons disabled with tooltip. Can navigate all pages. Can access billing page.
- [ ] **Admin with `canceled`:** Read-only access. Banner visible. All mutation buttons disabled with tooltip. Can navigate all pages. Can access billing page.
- [ ] **Manager with `active`:** Full write access to operational pages. No banner. Mutation buttons enabled.
- [ ] **Manager with `unpaid`:** Read-only access. Banner visible. Mutation buttons disabled. Can navigate pages. Can access billing page (read-only, no manage actions).
- [ ] **Dispatcher with `active`:** Full write access to operational pages. No banner. Mutation buttons enabled.
- [ ] **Dispatcher with `unpaid`:** Read-only access. Banner visible. Mutation buttons disabled. Can navigate pages. Can access billing page (read-only, no manage actions).

---

### F.2 Read-Only Mode UX

- [ ] Banner appears at top of all admin pages when `isReadOnly === true`
- [ ] Banner message clearly explains read-only state and links to billing
- [ ] All mutation buttons are visually disabled (not hidden)
- [ ] Disabled buttons show tooltip on hover explaining why disabled
- [ ] Forms are non-editable (read-only inputs or disabled)
- [ ] Users can still view all data (SELECT queries work)
- [ ] Users can navigate between pages normally
- [ ] Billing page is accessible and shows upgrade CTA

---

### F.3 Frontend Mutation Blocking

- [ ] Cannot click "Create Job" button when `unpaid`/`canceled`
- [ ] Cannot click "Edit Job" button when `unpaid`/`canceled`
- [ ] Cannot click "Delete Job" button when `unpaid`/`canceled`
- [ ] Cannot submit job form when `unpaid`/`canceled`
- [ ] Cannot create customer when `unpaid`/`canceled`
- [ ] Cannot update customer when `unpaid`/`canceled`
- [ ] Cannot delete customer when `unpaid`/`canceled`
- [ ] Cannot create crew when `unpaid`/`canceled`
- [ ] Cannot update crew when `unpaid`/`canceled`
- [ ] Cannot delete crew when `unpaid`/`canceled`
- [ ] Cannot record payment when `unpaid`/`canceled`
- [ ] Cannot void payment when `unpaid`/`canceled`
- [ ] Cannot generate recurring jobs when `unpaid`/`canceled`
- [ ] Cannot generate routes when `unpaid`/`canceled`
- [ ] Cannot assign teams to jobs when `unpaid`/`canceled`
- [ ] Cannot update settings when `unpaid`/`canceled`
- [ ] Cannot upload logo when `unpaid`/`canceled`

---

### F.4 Backend Mutation Blocking

- [ ] `record_payment()` RPC returns error for `unpaid`/`canceled` status
- [ ] `void_payment()` RPC returns error for `unpaid`/`canceled` status
- [ ] `generate_jobs_from_recurring()` RPC returns error for `unpaid`/`canceled` status
- [ ] `generate_team_route_for_day()` RPC returns error for `unpaid`/`canceled` status
- [ ] `create-customer-login` edge function returns error for `unpaid`/`canceled` status
- [ ] `set-customer-password` edge function returns error for `unpaid`/`canceled` status
- [ ] `create-crew-login` edge function returns error for `unpaid`/`canceled` status
- [ ] `set-crew-password` edge function returns error for `unpaid`/`canceled` status
- [ ] Error messages are clear and point to billing resolution

---

### F.5 Active/Trialing/Past_Due Write Access

- [ ] All mutation buttons enabled for `active` status
- [ ] All mutation buttons enabled for `trialing` status
- [ ] All mutation buttons enabled for `past_due` status
- [ ] No banner shown for `active`/`trialing`/`past_due` status
- [ ] All RPCs/edge functions allow mutations for `active`/`trialing`/`past_due` status

---

### F.6 Billing Page Access

- [ ] Billing page (`/admin/billing`) is accessible to `unpaid`/`canceled` users
- [ ] Checkout button is enabled for `unpaid`/`canceled` users (they need to pay)
- [ ] Billing portal button is enabled for `unpaid`/`canceled` users (if Stripe customer exists)
- [ ] Billing page shows clear status and upgrade CTA
- [ ] Settings page is accessible but mutations are blocked for `unpaid`/`canceled` users

---

### F.7 Support Mode Preserved

- [ ] Platform admin in support mode is not affected by tenant billing status
- [ ] Support mode read-only restrictions remain independent of billing status
- [ ] Support mode can still reconcile billing for `unpaid`/`canceled` tenants
- [ ] Support mode can still view all tenant data regardless of billing status

---

### F.8 No Route Redirects

- [ ] Direct URL access to `/admin/jobs` with `unpaid` status shows page in read-only mode (no redirect)
- [ ] Direct URL access to `/admin/customers` with `unpaid` status shows page in read-only mode (no redirect)
- [ ] Direct URL access to `/admin/crew` with `unpaid` status shows page in read-only mode (no redirect)
- [ ] Direct URL access to any admin page with `unpaid`/`canceled` status shows page in read-only mode (no redirect)
- [ ] Users can navigate between pages normally regardless of billing status

---

## Summary

**Architecture Status:** ✅ **Implementation-Ready**

**Key Decisions:**
1. Read-only mode (not redirect mode) - ✅ Confirmed
2. Backend enforcement required - ✅ Confirmed
3. Single source of truth via `useBillingGate` hook - ✅ Confirmed
4. Defense-in-depth (frontend + backend) - ✅ Confirmed
5. Internal roles only - ✅ Confirmed

**Recommended First Code Prompt:**
"Implement Step 1: Create `src/hooks/useBillingGate.js` hook with the API contract defined in PHASE_A1_IMPLEMENTATION_PLAN_V2.md Section B. The hook should read `subscriptionStatus` from `UserContext` and implement the policy logic: active/trialing/past_due = write allowed, unpaid/canceled = read-only. Return the exact API shape specified in the plan."

**Remaining Ambiguity:**
1. **Grace Window Logic:** Plan assumes no grace window unless existing code requires it. Need to confirm if `billing_grace_until` should extend write access beyond `past_due` status. **Decision:** Defer to product owner. For Phase A, use strict status-based policy only.

2. **Direct Table Mutations:** Plan recommends frontend + RPC hardening only, deferring RLS billing checks. Need to confirm if this is acceptable for launch. **Decision:** Acceptable for Phase A. Monitor for bypass attempts. Can add RLS checks in follow-up phase if needed.

3. **Error Handling:** Need to confirm exact error codes and messages for backend enforcement. **Decision:** Use consistent pattern: `SUBSCRIPTION_UNPAID` / `SUBSCRIPTION_CANCELED` codes with clear messages pointing to billing resolution.

---

**Files to Create:**
- `src/hooks/useBillingGate.js`
- `src/components/BillingReadOnlyBanner.jsx`
- `src/components/ui/BillingGuard.jsx` (optional, if reusable pattern needed)
- `supabase/migrations/YYYYMMDDHHMMSS_add_billing_checks_to_*.sql` (multiple)

**Files to Modify:**
- `src/layouts/AppShell.jsx`
- All Priority 1 admin pages (8 files)
- All Priority 2 admin pages (4+ files)
- 4 RPC migrations (update existing functions)
- 4 edge functions
