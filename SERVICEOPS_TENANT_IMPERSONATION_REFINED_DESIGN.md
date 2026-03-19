# ServiceOps Tenant Impersonation / Support Mode - Refined Design

**Date:** 2026-03-11  
**Purpose:** Refine support-mode architecture to preserve platform_admin identity while enabling safe tenant access.

---

## A. What Should Stay Unchanged

### 1. Core Identity Functions
- **`current_user_role()`** - Should continue returning actual role (`'platform_admin'`)
- **`profiles.role`** - Should never be mutated
- **`auth.uid()`** - Should always reflect real platform_admin user

### 2. Platform Admin Routes
- `/platform/*` routes should remain exclusive to `platform_admin`
- Platform RPCs should continue checking `v_role <> 'platform_admin'` (no change)

### 3. Audit Trail Integrity
- All actions should be traceable to real `auth.uid()` (platform_admin)
- Support sessions should be logged but not mask real identity

### 4. Most RLS Policies
- Policies that check `current_user_role() = 'admin'` should remain unchanged initially
- Only add support-mode exceptions where necessary

---

## B. What Should Be Added

### 1. Support Session Table
```sql
CREATE TABLE public.support_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_admin_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz NULL,
  reason text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### 2. New Helper Functions (NOT Modifying Existing Ones)

**`is_support_mode()`:**
```sql
CREATE OR REPLACE FUNCTION public.is_support_mode()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.support_sessions
    WHERE platform_admin_id = auth.uid()
      AND ended_at IS NULL
  )
$$;
```

**`current_support_company_id()`:**
```sql
CREATE OR REPLACE FUNCTION public.current_support_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT target_company_id
  FROM public.support_sessions
  WHERE platform_admin_id = auth.uid()
    AND ended_at IS NULL
  ORDER BY started_at DESC
  LIMIT 1
$$;
```

### 3. Modified Helper Function (Minimal Change)

**`current_company_id()` - Modified to check support mode:**
```sql
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT COALESCE(
    -- If in support mode, return support company
    public.current_support_company_id(),
    -- Otherwise return profile company_id
    (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  )
$$;
```

**Rationale:** This is the MINIMUM change needed. It preserves `current_user_role()` unchanged while enabling company scoping for support mode.

### 4. Support Session RPCs

**`start_support_session(p_target_company_id uuid, p_reason text DEFAULT NULL)`:**
- Verify caller is `platform_admin`
- End any existing active session
- Create new support session
- Return session id

**`end_support_session()`:**
- Verify caller is `platform_admin`
- Set `ended_at = now()` for active session

**`get_active_support_session()`:**
- Return active support session for current user (if any)

---

## C. What Should NOT Be Globally Overridden

### 1. `current_user_role()` Function
- **DO NOT modify** to return `'admin'` in support mode
- Keep returning actual role: `'platform_admin'`
- **Rationale:** Preserves identity distinction, prevents accidental privilege escalation

### 2. RLS Policies (Initially)
- **DO NOT modify** existing RLS policies that check `current_user_role() = 'admin'`
- Instead, add support-mode-aware policies OR selectively patch high-value policies
- **Rationale:** Minimizes risk, allows incremental enablement

### 3. Most RPC Functions (Initially)
- **DO NOT modify** all RPCs to allow support mode
- Start with read-only access, then selectively enable mutations
- **Rationale:** Phased rollout reduces risk

---

## D. Minimum Viable Support-Mode Design

### Option: **B + Selective Patches** (Recommended)

**Backend Changes:**
1. ✅ Create `support_sessions` table
2. ✅ Create `is_support_mode()` helper
3. ✅ Create `current_support_company_id()` helper
4. ✅ Modify `current_company_id()` to check support mode (minimal, safe change)
5. ⚠️ **DO NOT modify `current_user_role()`** - keep it returning real role
6. ⚠️ **Selectively patch** only high-value RLS policies and RPCs for read access

**Frontend Changes:**
1. ✅ `UserContext.jsx` - Detect support mode, override `companyId` in context
2. ✅ `ProtectedRoute.jsx` - Allow `platform_admin` in support mode to access admin routes
3. ✅ `navConfig.js` - Show admin nav when in support mode
4. ✅ Support mode banner/indicator

**Why This Is Minimum Viable:**
- Only ONE helper function modified (`current_company_id()`)
- No global role override
- Selective enablement of read access
- Mutations remain blocked until Phase 2

---

## E. Exact Files/Functions/Policies Likely to Change First

### Database (Phase 1 - Read-Only)

**New Migration:**
- `supabase/migrations/YYYYMMDDHHMMSS_support_mode_foundation.sql`
  - Create `support_sessions` table
  - Create `is_support_mode()` function
  - Create `current_support_company_id()` function
  - Modify `current_company_id()` function
  - Create `start_support_session()` RPC
  - Create `end_support_session()` RPC
  - Create `get_active_support_session()` RPC

**RLS Policies to Patch (Read-Only First):**

1. **`payments_select_admin`** (payments table):
   - Current: `company_id = current_company_id() AND current_user_role() = 'admin'`
   - Patch: `company_id = current_company_id() AND (current_user_role() = 'admin' OR is_support_mode())`
   - **File:** `supabase/migrations/YYYYMMDDHHMMSS_support_mode_rls_reads.sql`

2. **`profiles_select_admin_all_company`** (profiles table):
   - Current: `current_user_role() = 'admin' AND company_id = current_company_id()`
   - Patch: `(current_user_role() = 'admin' OR is_support_mode()) AND company_id = current_company_id()`
   - **File:** Same migration

3. **`teams_select_same_company`** (teams table):
   - Current: `company_id = current_company_id() AND current_company_id() IS NOT NULL`
   - **No change needed** - Already only checks company_id

4. **`invoices` RLS policies** (if they exist):
   - Check for policies that require `current_user_role() = 'admin'`
   - Patch similarly

**RPCs to Patch (Read-Only First):**

1. **Read-only RPCs that only check `v_company_id IS NULL`:**
   - These will work automatically once `current_company_id()` is fixed
   - No changes needed

2. **Read-only RPCs that check `v_role NOT IN ('admin', ...)`:**
   - Examples: Revenue reports, profit trends, collections reads
   - **Patch:** Add `OR is_support_mode()` to role checks
   - **File:** `supabase/migrations/YYYYMMDDHHMMSS_support_mode_rpc_reads.sql`

**RPCs to Leave Blocked (Mutations - Phase 2):**
- `record_payment()` - Requires `v_role NOT IN ('admin','crew')`
- `void_payment()` - Requires `v_role <> 'admin'`
- Invoice creation/update RPCs
- Job creation/update RPCs
- Customer creation/update RPCs
- All other mutation RPCs

### Frontend (Phase 1)

**Files to Modify:**

1. **`src/context/UserContext.jsx`:**
   - Add support mode detection: call `get_active_support_session()` on load
   - Override `companyId` in context when `supportMode === true`
   - Add `supportMode`, `supportSessionId`, `supportTargetCompanyId` to context

2. **`src/ProtectedRoute.jsx`:**
   - Allow `platform_admin` in support mode: `(role === 'platform_admin' && supportMode)`
   - Or: Check `allowedRoles.includes(role) || (role === 'platform_admin' && supportMode && allowedRoles.includes('admin'))`

3. **`src/components/nav/navConfig.js`:**
   - When `supportMode === true`, return admin nav items
   - Keep platform admin nav items visible too (or hide them)

4. **`src/components/nav/Topbar.jsx`:**
   - Show "Support Mode" indicator when `supportMode === true`
   - Add "Exit Support Mode" button

5. **`src/pages/platform/PlatformCompanyDetail.jsx`:**
   - Add "Enter Support Mode" button
   - Call `start_support_session()` RPC
   - Redirect to `/admin` after starting

**Files to Create:**

1. **`src/components/SupportModeBanner.jsx`:**
   - Banner component showing support mode is active
   - Exit button

---

## F. Recommended Phased Implementation Plan

### Phase 1: Read-Only Support Mode (MVP)

**Goal:** Platform admin can view tenant admin pages and read company-scoped data.

**Database:**
1. Create `support_sessions` table
2. Create helper functions (`is_support_mode()`, `current_support_company_id()`)
3. Modify `current_company_id()` to check support mode
4. Create support session RPCs
5. Patch read-only RLS policies (payments_select_admin, profiles_select_admin_all_company)
6. Patch read-only RPCs that check role (revenue reports, etc.)

**Frontend:**
1. Update `UserContext.jsx` to detect support mode
2. Update `ProtectedRoute.jsx` to allow platform_admin in support mode
3. Update `navConfig.js` to show admin nav in support mode
4. Add support mode banner to Topbar
5. Add "Enter Support Mode" button to company detail page

**Testing:**
- Verify platform_admin can access `/admin/*` routes in support mode
- Verify platform_admin can read jobs, customers, payments, etc.
- Verify mutations are still blocked (expected)
- Verify support mode banner appears
- Verify exit support mode works

**Success Criteria:**
- ✅ Platform admin can view all tenant admin pages
- ✅ Platform admin can read all company-scoped data
- ✅ Mutations are blocked (expected for Phase 1)
- ✅ Support mode is clearly indicated in UI
- ✅ Exit support mode works correctly

### Phase 2: Selective Mutation Enablement (Future)

**Goal:** Enable specific safe mutations in support mode.

**Approach:**
- Identify safe mutations (e.g., job status updates, customer notes)
- Add `is_support_mode()` checks to specific RPCs
- Add support-mode-aware RLS policies for mutations
- Add audit logging for support-mode mutations

**Prohibited Even in Phase 2:**
- Billing mutations (plan, subscription_status)
- Company deletion
- User role changes
- Audit log deletion

**Testing:**
- Verify allowed mutations work in support mode
- Verify prohibited mutations remain blocked
- Verify audit trail shows platform_admin as actor

---

## G. Investigation Findings

### 1. Frontend Route/Guard Components Requiring role === 'admin'

**Components Found:**
- `src/ProtectedRoute.jsx` (line 31) - Checks `allowedRoles.includes(role)`
- `src/components/OnboardingGuard.jsx` (line 79) - Checks `profile.role === 'admin'`
- `src/components/nav/navConfig.js` (line 18) - Checks `role === 'admin'`
- `src/Navbar.jsx` (lines 77, 82, 90, 97) - Multiple checks for `role === 'admin'`
- `src/Login.jsx` (lines 22, 83) - Redirects based on role
- `src/pages/AuthCallback.jsx` (line 299) - Redirects based on role
- `src/components/RootRedirect.jsx` (line 26) - Redirects based on role

**Answer:** These can be updated to allow `role === 'platform_admin' && supportMode` without changing actual role.

### 2. Tenant Data Reads That Only Depend on Company Scoping

**Found:**
- **Direct table queries:** Most admin pages query tables directly with `.eq('company_id', companyId)`
  - These will work if `companyId` is provided in frontend context
  - Examples: `jobs`, `customers`, `crew_members`, `teams`, `expenses`
  
- **RLS Policies (company-only):**
  - `teams_select_same_company` - Only checks `company_id = current_company_id()`
  - `profiles_select_same_company` - Only checks `company_id = current_company_id()`
  - Many tables may not have RLS enabled (need verification)

- **RLS Policies (company + role):**
  - `payments_select_admin` - Requires `current_user_role() = 'admin'`
  - `profiles_select_admin_all_company` - Requires `current_user_role() = 'admin'`
  - Most mutation policies require role checks

**Answer:** Many reads will work with just `current_company_id()` fix, but some require role patch.

### 3. RLS Policies and RPCs Requiring Admin Role

**RLS Policies Found:**
- `payments_select_admin` - `current_user_role() = 'admin'`
- `profiles_select_admin_all_company` - `current_user_role() = 'admin'`
- `teams_insert_admin` - `current_user_role() = 'admin'`
- `teams_update_admin` - `current_user_role() = 'admin'`
- `teams_delete_admin` - `current_user_role() = 'admin'`
- `invoices` policies (if they exist) - Likely require `current_user_role() = 'admin'`

**RPCs Found (Requiring Admin Role):**
- `void_payment()` - `v_role <> 'admin'`
- `record_payment()` - `v_role NOT IN ('admin','crew')` (but allows crew, so support mode could work)
- Revenue/finance RPCs - `v_role NOT IN ('admin', 'manager', 'dispatcher')`
- Invoice RPCs - `v_role NOT IN ('admin', 'manager', 'dispatcher')` or `v_role <> 'admin'`
- Collections RPCs - `v_role NOT IN ('admin', 'manager', 'dispatcher')`

**Answer:** Many RLS policies and RPCs require admin role. Need selective patching.

### 4. Minimum Viable Backend Change

**Recommended: Option B + Selective Patches**

**Minimum Changes:**
1. ✅ Modify `current_company_id()` only (enables company scoping)
2. ✅ Add `is_support_mode()` helper (for selective checks)
3. ✅ Add `current_support_company_id()` helper (for company lookup)
4. ⚠️ Patch read-only RLS policies (payments_select_admin, profiles_select_admin_all_company)
5. ⚠️ Patch read-only RPCs (revenue reports, etc.)

**Why This Is Minimum:**
- Only ONE existing function modified (`current_company_id()`)
- No global role override
- Selective enablement (read-only first)
- Mutations remain blocked (safe default)

### 5. Read-Only Support Mode Feasibility

**Feasible:** ✅ **YES**

**What Works Automatically:**
- Direct table queries with `.eq('company_id', companyId)` - Will work if frontend provides companyId
- RLS policies that only check `company_id = current_company_id()` - Will work after `current_company_id()` fix
- RPCs that only check `v_company_id IS NULL` - Will work after `current_company_id()` fix

**What Needs Patching:**
- RLS policies requiring `current_user_role() = 'admin'` - Need `OR is_support_mode()` patch
- RPCs requiring `v_role NOT IN ('admin', ...)` - Need `OR is_support_mode()` patch

**What Remains Blocked (Expected):**
- All mutation RPCs - Intentionally blocked in Phase 1
- Mutation RLS policies - Intentionally blocked in Phase 1

**Conclusion:** Read-only support mode is **highly feasible** with minimal changes.

### 6. Recommended Phased Rollout

**Phase 1: Read-Only Support Mode (MVP)**
- Support session table + helpers
- Modify `current_company_id()` only
- Patch read-only RLS policies
- Patch read-only RPCs
- Frontend support mode detection
- Route access enablement
- UI indicators

**Phase 2: Selective Mutations (Future)**
- Identify safe mutations
- Patch specific mutation RPCs
- Add mutation RLS policies
- Enhanced audit logging

---

## Summary

### Key Design Decisions

1. **Preserve Identity:** `current_user_role()` stays unchanged, returns `'platform_admin'`
2. **Minimal Backend Change:** Only modify `current_company_id()` to check support mode
3. **Selective Enablement:** Patch only read-only policies/RPCs initially
4. **Phased Rollout:** Read-only first, mutations later

### Minimum Viable Design

**Backend:**
- Support sessions table
- `is_support_mode()` helper
- `current_support_company_id()` helper
- Modified `current_company_id()` (checks support mode)
- Support session RPCs
- Patched read-only RLS policies (2-3 policies)
- Patched read-only RPCs (selective)

**Frontend:**
- Support mode detection in UserContext
- Route access in ProtectedRoute
- Navigation in navConfig
- UI indicators in Topbar
- Entry point in PlatformCompanyDetail

### Files to Change (Phase 1)

**Database:**
- New: `supabase/migrations/YYYYMMDDHHMMSS_support_mode_foundation.sql`
- New: `supabase/migrations/YYYYMMDDHHMMSS_support_mode_rls_reads.sql`
- New: `supabase/migrations/YYYYMMDDHHMMSS_support_mode_rpc_reads.sql`

**Frontend:**
- Modify: `src/context/UserContext.jsx`
- Modify: `src/ProtectedRoute.jsx`
- Modify: `src/components/nav/navConfig.js`
- Modify: `src/components/nav/Topbar.jsx`
- Modify: `src/pages/platform/PlatformCompanyDetail.jsx`
- New: `src/components/SupportModeBanner.jsx`

---

**End of Refined Design**
