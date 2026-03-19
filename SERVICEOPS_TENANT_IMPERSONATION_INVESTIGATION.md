# ServiceOps Tenant Impersonation / Support Mode Investigation

**Date:** 2026-03-11  
**Purpose:** Determine safest architecture for platform_admin to temporarily enter tenant admin experience for support/debugging, without weakening tenant isolation or breaking auditability.

---

## A. Current Access Model

### 1. Auth/Session Model

**Session Loading:**
- **File:** `src/context/UserContext.jsx`
- **Process:**
  1. `supabase.auth.getSession()` loads Supabase auth session
  2. If session exists, queries `profiles` table: `SELECT id, full_name, role, company_id WHERE id = auth.uid()`
  3. If profile has `company_id`, also fetches company onboarding/billing data from `companies` table
  4. Profile data stored in React context state
  5. Listens to `supabase.auth.onAuthStateChange()` for session updates

**Key Dependencies:**
- **Auth session:** `session.user.id` (from Supabase auth)
- **Profile data:** `profiles` table row where `id = auth.uid()`
- **Role source:** `profile.role` (from profiles table)
- **Company source:** `profile.company_id` (from profiles table)

**Context API:**
- `useUser()` hook provides: `session`, `profile`, `role`, `companyId`, `loading`
- `role` = `profile?.role || null`
- `companyId` = `profile?.company_id || null`

### 2. Tenant Admin Access Model

**Route Protection:**
- **File:** `src/ProtectedRoute.jsx`
- **Logic:** Checks `allowedRoles.includes(role)` where `role` comes from `useUser()`
- **Admin routes:** Protected with `allowedRoles={['admin']}`
- **Blocking:** If role doesn't match, redirects to login

**Onboarding Guard:**
- **File:** `src/components/OnboardingGuard.jsx`
- **Logic:**
  - Excludes `platform_admin` from tenant onboarding checks (line 31-33)
  - For admin role: requires `company_id` exists, redirects to `/bootstrap/company` if missing
  - Checks onboarding completion (`setup_completed_at` or `onboarding_step = 'finish'`)
  - Enforces billing status (active/trialing/grace period)
- **Blocking:** Blocks admin routes if onboarding incomplete or billing inactive

**Frontend Company Scoping:**
- Admin pages fetch `company_id` via:
  1. `useUser().companyId` (from UserContext)
  2. Direct query: `supabase.from('profiles').select('company_id').eq('id', user.id)`
- All tenant data queries filter by `company_id`:
  - `supabase.from('jobs').eq('company_id', companyId)`
  - `supabase.from('customers').eq('company_id', companyId)`
  - etc.

**Database Company Scoping (RLS/RPCs):**

**Helper Functions:**
- `current_company_id()` - Returns `SELECT company_id FROM profiles WHERE id = auth.uid()`
- `current_user_role()` - Returns `SELECT role FROM profiles WHERE id = auth.uid()`
- Both are `SECURITY DEFINER` and use `auth.uid()` directly

**RLS Policies:**
- Most tenant tables use: `company_id = public.current_company_id()`
- Example (payments): `USING (company_id = public.current_company_id() AND public.current_user_role() = 'admin')`
- **Critical:** RLS policies depend on `auth.uid()` → `profiles.company_id` chain

**RPC Functions:**
- Most tenant RPCs check:
  ```sql
  SELECT p.role, p.company_id INTO v_role, v_company_id
  FROM public.profiles p
  WHERE p.id = auth.uid();
  
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'NO_COMPANY';
  END IF;
  ```
- **Critical:** RPCs read `profiles.company_id` directly, not from frontend context

### 3. Role/Company Dependencies

**Critical Dependencies:**

1. **Frontend Route Protection:**
   - `ProtectedRoute.jsx` - Uses `role` from `useUser()`
   - `OnboardingGuard.jsx` - Uses `profile.role` and `profile.company_id`
   - `navConfig.js` - Uses `role` to determine navigation items
   - `Sidebar.jsx` - Uses `role` to show/hide nav items

2. **Frontend Data Fetching:**
   - All admin pages use `companyId` from `useUser()` or direct profile query
   - Pages fail gracefully if `companyId` is null (no data shown)

3. **Database RLS Policies:**
   - Depend on `current_company_id()` which reads `profiles.company_id WHERE id = auth.uid()`
   - If `company_id` is NULL, RLS blocks all tenant data access

4. **Database RPC Functions:**
   - Most RPCs check `v_company_id IS NULL` and raise `'NO_COMPANY'` exception
   - RPCs enforce tenant isolation by reading `profiles.company_id` directly

5. **Helper Functions:**
   - `current_company_id()` - Used in RLS policies
   - `current_user_role()` - Used in RLS policies and RPCs
   - Both depend on `auth.uid()` → `profiles` lookup

**Impersonation Requirements:**
- **Frontend-only masquerade would be insufficient** because:
  - Database RLS policies use `current_company_id()` which reads from `profiles` table
  - RPC functions read `profiles.company_id` directly
  - Even if frontend shows different `companyId`, database queries would fail

---

## B. Breakpoints for Impersonation

### What Breaks Today if platform_admin Enters /admin/*

1. **ProtectedRoute.jsx:**
   - ✅ **Would block:** `allowedRoles={['admin']}` doesn't include `'platform_admin'`
   - **Fix needed:** Allow `platform_admin` OR check for support mode

2. **OnboardingGuard.jsx:**
   - ✅ **Would bypass:** Already excludes `platform_admin` (line 31-33)
   - **Risk:** Would skip onboarding/billing checks (may be desired for support)

3. **Frontend Data Fetching:**
   - ❌ **Would fail:** `useUser().companyId` returns `null` for platform_admin
   - **Fix needed:** Support mode must provide `companyId` to frontend context

4. **Database RLS:**
   - ❌ **Would block:** `current_company_id()` returns `NULL` for platform_admin
   - **Fix needed:** Support mode must make `current_company_id()` return target company

5. **Database RPCs:**
   - ❌ **Would fail:** Most RPCs check `v_company_id IS NULL` and raise exception
   - **Fix needed:** RPCs must allow support mode OR support mode must set profile.company_id

6. **Navigation:**
   - ✅ **Would work:** `navConfig.js` checks `role === 'admin'` (wouldn't match)
   - **Fix needed:** Support mode must show admin nav OR special support nav

7. **Components Assuming role=admin:**
   - `Sidebar.jsx` - Uses `role` for nav items
   - `Topbar.jsx` - May use role for labels
   - Various admin pages - Assume `companyId` exists

---

## C. Options Considered

### Option 1: Mutate platform_admin profile.role/company_id Temporarily

**Approach:**
- Update `profiles` table: set `role = 'admin'`, `company_id = target_company_id`
- Store original values in session/localStorage
- Restore on exit

**Risks:**
- ⚠️ **High risk:** Mutates permanent data (even if temporary)
- ⚠️ **Race conditions:** If user opens multiple tabs, conflicts possible
- ⚠️ **Audit trail:** Hard to track what was changed by support vs. real admin
- ⚠️ **Session conflicts:** If platform_admin logs out/in, state lost
- ⚠️ **Database triggers:** May fire unwanted triggers on profile update
- ⚠️ **RLS side effects:** Other queries might see wrong company_id

**Verdict:** ❌ **NOT RECOMMENDED** - Too risky, breaks auditability

### Option 2: Create Second Login/Session as Tenant Admin

**Approach:**
- Platform admin creates/uses a separate tenant admin account
- Switch between sessions using `supabase.auth.signInWithPassword()`
- Store platform_admin session in localStorage

**Risks:**
- ⚠️ **Security risk:** Requires platform_admin to know tenant admin password
- ⚠️ **Account management:** Need to create/maintain support accounts per tenant
- ⚠️ **Audit trail:** Actions appear as tenant admin, not platform_admin
- ⚠️ **Session management:** Complex to switch back/forth
- ⚠️ **Permission issues:** Support account may not have all needed permissions

**Verdict:** ❌ **NOT RECOMMENDED** - Security and auditability concerns

### Option 3: Frontend-Only Company Override

**Approach:**
- Frontend context stores `supportModeCompanyId` separately
- Frontend queries use `supportModeCompanyId` instead of `companyId`
- Database still uses `auth.uid()` → `profiles.company_id`

**Risks:**
- ❌ **Won't work:** Database RLS policies use `current_company_id()` which reads from `profiles`
- ❌ **RPC failures:** RPCs check `profiles.company_id` directly, will fail
- ❌ **No database access:** All tenant data queries would be blocked by RLS

**Verdict:** ❌ **NOT RECOMMENDED** - Fundamentally broken, database access blocked

### Option 4: Support Session Table with Explicit Support-Mode Context

**Approach:**
- Create `public.support_sessions` table:
  - `id` uuid primary key
  - `platform_admin_id` uuid references profiles(id)
  - `target_company_id` uuid references companies(id)
  - `started_at` timestamptz
  - `ended_at` timestamptz nullable
  - `reason` text nullable
- Modify `current_company_id()` to check for active support session:
  ```sql
  SELECT COALESCE(
    (SELECT target_company_id FROM support_sessions 
     WHERE platform_admin_id = auth.uid() 
     AND ended_at IS NULL 
     LIMIT 1),
    (SELECT company_id FROM profiles WHERE id = auth.uid())
  )
  ```
- Modify `current_user_role()` to return `'admin'` if in support mode
- Frontend context checks for active support session and shows support mode UI

**Risks:**
- ✅ **Low risk:** No profile mutation, explicit audit trail
- ✅ **Auditable:** All support sessions logged with start/end times
- ✅ **Reversible:** Easy to exit support mode
- ⚠️ **Complexity:** Requires modifying helper functions and RPCs
- ⚠️ **Testing:** Need to test all RPCs work in support mode

**Verdict:** ✅ **RECOMMENDED** - Safest approach with proper auditability

---

## D. Existing Audit/Logging Support

### Current Audit Infrastructure

**Found:**
- `billing_subscription_history` table - Logs billing changes with `changed_by`, `source`, `stripe_event_id`
- `stripe_event_ledger` table - Logs all Stripe webhook events
- `insert_audit_log` RPC mentioned in `UserContext.jsx` (line 99) - But no migration found for this function
- Various RPCs log actions (e.g., `log_customer_activity`)

**Missing:**
- No dedicated `audit_log` table found in migrations
- No support session logging infrastructure

**Best Place for Impersonation Logging:**
- **New table:** `public.support_sessions` (as described in Option 4)
- **Fields:**
  - `id` uuid primary key
  - `platform_admin_id` uuid references profiles(id)
  - `target_company_id` uuid references companies(id)
  - `started_at` timestamptz default now()
  - `ended_at` timestamptz nullable
  - `reason` text nullable
  - `metadata` jsonb default '{}'
- **Indexes:**
  - `support_sessions_platform_admin_active_idx` on (platform_admin_id, ended_at) where ended_at IS NULL
  - `support_sessions_target_company_idx` on (target_company_id)
- **RLS:** service_role only (no authenticated access)

---

## E. Route/Layout Behavior

### What Breaks Today

1. **ProtectedRoute.jsx:**
   - Blocks `platform_admin` from `/admin/*` routes
   - **Fix:** Check for active support session OR allow `platform_admin` in support mode

2. **OnboardingGuard.jsx:**
   - Already bypasses `platform_admin` (good for support)
   - **Consideration:** May want to show billing status even in support mode

3. **Navigation (navConfig.js, Sidebar.jsx):**
   - `platform_admin` doesn't get admin nav items
   - **Fix:** Show admin nav when in support mode

4. **Admin Pages:**
   - All assume `companyId` exists from `useUser()`
   - **Fix:** Support mode must provide `companyId` in context

5. **AppShell/Sidebar:**
   - Uses `role` for navigation
   - **Fix:** Support mode must show admin nav

### Components That Need Support-Mode Awareness

1. **UserContext.jsx:**
   - Must check for active support session
   - Must override `companyId` and `role` when in support mode

2. **ProtectedRoute.jsx:**
   - Must allow `platform_admin` in support mode to access admin routes

3. **OnboardingGuard.jsx:**
   - Already bypasses `platform_admin` (good)
   - May want to show support mode banner

4. **navConfig.js:**
   - Must return admin nav items when in support mode

5. **Sidebar.jsx:**
   - Already uses `navConfig.js` (will work if navConfig fixed)

6. **Topbar.jsx:**
   - May need to show "Support Mode" indicator

---

## F. Security Risks

### Option 1 Risks (Profile Mutation)
- **Data corruption:** Permanent profile changes
- **Audit trail:** Hard to distinguish support actions
- **Race conditions:** Multiple tabs/sessions
- **Session conflicts:** Lost state on logout

### Option 2 Risks (Second Session)
- **Password management:** Security risk
- **Account proliferation:** Need support accounts per tenant
- **Audit trail:** Actions appear as tenant admin
- **Permission gaps:** Support account may lack permissions

### Option 3 Risks (Frontend-Only)
- **Database access:** RLS blocks all queries
- **RPC failures:** All RPCs fail with NO_COMPANY
- **Fundamentally broken:** Won't work at all

### Option 4 Risks (Support Session Table)
- **Helper function complexity:** Must modify `current_company_id()` and `current_user_role()`
- **RPC testing:** All RPCs must be tested in support mode
- **Session management:** Must handle expired sessions
- **Edge cases:** What if support session ends mid-operation?

**Mitigation for Option 4:**
- ✅ Explicit support session table with audit trail
- ✅ No profile mutation
- ✅ Easy to exit support mode
- ✅ Can add time limits/expiration
- ✅ Can add IP restrictions
- ✅ Can add reason/note requirement

---

## G. Recommended Architecture

### A. Backend/Data Model

**New Table: `public.support_sessions`**
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

CREATE INDEX support_sessions_platform_admin_active_idx
  ON public.support_sessions(platform_admin_id, ended_at)
  WHERE ended_at IS NULL;

CREATE INDEX support_sessions_target_company_idx
  ON public.support_sessions(target_company_id);

-- RLS: service_role only
ALTER TABLE public.support_sessions ENABLE ROW LEVEL SECURITY;
-- No authenticated policies (accessed via RPC only)
```

**Modified Helper Functions:**

1. **`current_company_id()`:**
```sql
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT COALESCE(
    -- Check for active support session first
    (SELECT target_company_id 
     FROM public.support_sessions 
     WHERE platform_admin_id = auth.uid() 
       AND ended_at IS NULL 
     ORDER BY started_at DESC 
     LIMIT 1),
    -- Fall back to profile company_id
    (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  )
$$;
```

2. **`current_user_role()`:**
```sql
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT CASE
    -- If in support mode, return 'admin'
    WHEN EXISTS (
      SELECT 1 FROM public.support_sessions 
      WHERE platform_admin_id = auth.uid() 
        AND ended_at IS NULL
    ) THEN 'admin'
    -- Otherwise return actual role
    ELSE (SELECT role FROM public.profiles WHERE id = auth.uid())
  END
$$;
```

**New RPC Functions:**

1. **`start_support_session(p_target_company_id uuid, p_reason text DEFAULT NULL)`:**
   - Verify caller is `platform_admin`
   - End any existing active support session for this admin
   - Create new support session
   - Return session id

2. **`end_support_session()`:**
   - Verify caller is `platform_admin`
   - Set `ended_at = now()` for active session
   - Return success

3. **`get_active_support_session()`:**
   - Return active support session for current user (if any)
   - Used by frontend to detect support mode

### B. Session/Context Model

**Frontend Support Mode Detection:**
- `UserContext.jsx` calls `get_active_support_session()` on load
- If active session exists:
  - Override `companyId` = `support_session.target_company_id`
  - Override `role` = `'admin'` (for UI purposes)
  - Store `supportMode = true` and `supportSessionId` in context
- Frontend shows "Support Mode" banner/indicator

**Support Mode State:**
```javascript
{
  ...existingUserContext,
  supportMode: boolean,
  supportSessionId: uuid | null,
  supportTargetCompanyId: uuid | null,
  supportStartedAt: timestamptz | null
}
```

### C. Route Strategy

**ProtectedRoute.jsx:**
```javascript
// Allow platform_admin in support mode
if (allowedRoles && !allowedRoles.includes(role)) {
  // Check if platform_admin in support mode
  if (role === 'platform_admin' && supportMode) {
    // Allow access
  } else {
    // Block access
  }
}
```

**Alternative:** Add `'platform_admin'` to `allowedRoles` for admin routes, but only allow access when `supportMode === true`

### D. Audit Logging

**Support Session Table:**
- All support sessions logged with:
  - `platform_admin_id` - Who entered support mode
  - `target_company_id` - Which company was accessed
  - `started_at` - When support mode started
  - `ended_at` - When support mode ended (NULL = active)
  - `reason` - Optional reason/note for support session

**Additional Audit (Future):**
- Could add `support_action_log` table to log specific actions taken in support mode
- For now, existing audit logs (billing_history, etc.) will show `auth.uid()` = platform_admin_id

### E. How to Exit Impersonation Safely

**Exit Methods:**
1. **Explicit Exit Button:**
   - "Exit Support Mode" button in Topbar/Sidebar
   - Calls `end_support_session()` RPC
   - Refreshes user context
   - Redirects to `/platform`

2. **Automatic Expiration:**
   - Add `expires_at` column to `support_sessions`
   - Check on each request, auto-end expired sessions
   - Default: 4 hours

3. **Session Timeout:**
   - If platform_admin logs out, end support session
   - If platform_admin session expires, end support session

4. **Manual Admin Override:**
   - Platform admin can end any active support session via platform console
   - Safety mechanism if exit button fails

### F. What Should Remain Prohibited Even in Impersonation Mode

**Prohibited Actions:**
1. **Billing Mutations:**
   - Cannot create/update Stripe subscriptions
   - Cannot modify `companies.plan` or `companies.subscription_status`
   - Can view billing, but not mutate

2. **Company Deletion:**
   - Cannot delete company
   - Cannot delete company settings

3. **User Role Changes:**
   - Cannot change other users' roles
   - Cannot change other users' company_id

4. **Audit Log Deletion:**
   - Cannot delete audit logs
   - Cannot modify billing_history

**Implementation:**
- Add `is_support_mode()` helper function
- RPCs check `is_support_mode()` and raise exception for prohibited actions
- Frontend can also check `supportMode` to disable buttons

---

## H. Exact Files Likely to Change

### Database Migrations (New)
1. `supabase/migrations/YYYYMMDDHHMMSS_create_support_sessions.sql`
   - Create `support_sessions` table
   - Modify `current_company_id()` function
   - Modify `current_user_role()` function
   - Create `start_support_session()` RPC
   - Create `end_support_session()` RPC
   - Create `get_active_support_session()` RPC
   - Create `is_support_mode()` helper function

### Frontend Files (Modified)
1. `src/context/UserContext.jsx`
   - Add support mode detection
   - Add support mode state to context
   - Override `companyId` and `role` when in support mode

2. `src/ProtectedRoute.jsx`
   - Allow `platform_admin` in support mode to access admin routes

3. `src/components/nav/navConfig.js`
   - Return admin nav items when in support mode

4. `src/components/nav/Topbar.jsx`
   - Show "Support Mode" indicator
   - Add "Exit Support Mode" button

5. `src/pages/platform/PlatformCompanyDetail.jsx`
   - Add "Enter Support Mode" button

6. `src/pages/platform/PlatformCompanies.jsx`
   - Add "Enter Support Mode" action to companies table

### Frontend Files (New)
1. `src/components/SupportModeBanner.jsx`
   - Banner showing support mode is active
   - Exit button

### Database Functions (Modified - Future)
- RPCs that perform prohibited actions (billing mutations, etc.)
- Add `is_support_mode()` checks to raise exceptions

---

## I. Proposed Phased Implementation Order

### Phase 1: Foundation (Database + Basic Detection)
1. Create `support_sessions` table migration
2. Modify `current_company_id()` to check support sessions
3. Modify `current_user_role()` to return 'admin' in support mode
4. Create `start_support_session()` RPC
5. Create `end_support_session()` RPC
6. Create `get_active_support_session()` RPC
7. Test: Verify database helpers work correctly

### Phase 2: Frontend Detection & Context
1. Update `UserContext.jsx` to detect support mode
2. Add support mode state to context
3. Override `companyId` and `role` when in support mode
4. Test: Verify frontend context shows correct values

### Phase 3: Route Access
1. Update `ProtectedRoute.jsx` to allow platform_admin in support mode
2. Update `OnboardingGuard.jsx` if needed (already bypasses platform_admin)
3. Test: Verify platform_admin can access `/admin/*` in support mode

### Phase 4: UI/UX
1. Create `SupportModeBanner.jsx` component
2. Update `Topbar.jsx` to show support mode indicator
3. Update `navConfig.js` to show admin nav in support mode
4. Add "Enter Support Mode" button to company detail page
5. Test: Verify UI shows support mode correctly

### Phase 5: Safety & Prohibitions
1. Create `is_support_mode()` helper function
2. Add prohibited action checks to critical RPCs (billing mutations, etc.)
3. Add frontend checks to disable prohibited buttons
4. Test: Verify prohibited actions are blocked

### Phase 6: Audit & Monitoring
1. Add support session expiration (4 hour default)
2. Add platform console view of active support sessions
3. Add ability to end support sessions from platform console
4. Test: Verify audit trail and expiration work

---

## Summary

**Recommended Approach:** Option 4 - Support Session Table

**Key Benefits:**
- ✅ No profile mutation (safe)
- ✅ Explicit audit trail (all sessions logged)
- ✅ Reversible (easy to exit)
- ✅ Database-level enforcement (RLS/RPCs work correctly)
- ✅ Frontend-aware (UI can show support mode)

**Key Risks:**
- ⚠️ Complexity (requires modifying helper functions)
- ⚠️ Testing burden (all RPCs must work in support mode)
- ⚠️ Edge cases (expired sessions, multiple tabs)

**Mitigation:**
- Comprehensive testing of all RPCs in support mode
- Clear documentation of prohibited actions
- Automatic session expiration
- Platform console for monitoring active sessions

**Next Steps:**
1. Review and approve architecture
2. Implement Phase 1 (database foundation)
3. Test database helpers thoroughly
4. Proceed with phased implementation

---

**End of Investigation**
