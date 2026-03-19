# ServiceOps Platform Dashboard Data Access Investigation

**Date:** 2026-03-11  
**Purpose:** Determine safest way for `platform_admin` to read cross-tenant platform data for Platform Dashboard v1.

---

## A. Current Access Reality for platform_admin

### 1. public.companies Table

**RLS Status:** **NOT ENABLED** (no RLS policies found in migrations)

**Current Behavior:**
- No `ENABLE ROW LEVEL SECURITY` statement found for `companies` table
- No RLS policies found for `companies` table
- **Likely behavior:** If RLS is not enabled, authenticated users with SELECT grant can read all companies
- **Risk:** If RLS is enabled but no policies exist, all reads would be blocked

**Helper Function Used:**
- `public.current_company_id()` - Returns `company_id FROM public.profiles WHERE id = auth.uid()`
- **For platform_admin:** Returns `NULL` (company_id = null in profiles)

**Access Pattern:**
- Frontend code directly queries `companies` table via `.from("companies")`
- Examples: `src/hooks/useCompanySettings.js:27`, `src/pages/admin/Settings.jsx:64`
- These queries use `.eq("id", profile.company_id)` filter (application-level, not RLS)

**Conclusion:**
- **If RLS is disabled:** `platform_admin` can read ALL companies (security risk)
- **If RLS is enabled with no policies:** `platform_admin` sees ZERO rows (blocked)
- **Current state is ambiguous** - needs verification

### 2. public.stripe_event_ledger

**RLS Status:** **ENABLED**

**Policies:**
- `stripe_event_ledger_service_role_all` - Full access for `service_role` only
- **No policy for authenticated users**

**Grants:**
- `GRANT ALL ON public.stripe_event_ledger TO service_role`
- `REVOKE ALL ON public.stripe_event_ledger FROM authenticated`

**Current Behavior:**
- **platform_admin sees ZERO rows** (no authenticated policy exists)
- Only `service_role` can access this table

**File:** `supabase/migrations/20260311000001_create_stripe_event_ledger.sql:84-103`

### 3. public.billing_subscription_history

**RLS Status:** **ENABLED**

**Policies:**
- `billing_subscription_history_service_role_all` - Full access for `service_role`
- `billing_subscription_history_authenticated_select` - Read access for authenticated users

**Authenticated Policy:**
```sql
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
)
```

**Current Behavior:**
- **platform_admin sees ZERO rows** (because `current_company_id()` returns NULL)
- Policy explicitly requires `current_company_id() IS NOT NULL`
- Only tenant users (with company_id) can read their own company's history

**File:** `supabase/migrations/20260311000003_create_billing_subscription_history.sql:93-100`

### 4. public.plan_limits

**RLS Status:** **ENABLED**

**Policies:**
- `plan_limits_select_authenticated` - Read access for all authenticated users

**Policy:**
```sql
USING (true)  -- All authenticated users can read
```

**Current Behavior:**
- **platform_admin CAN read all plan_limits** (policy allows all authenticated users)
- This is safe - plan limits are not sensitive data

**File:** `supabase/migrations/20260310080002_plan_limits_table.sql:104-111`

---

## B. Exact Files/Migrations That Control Access

### Helper Functions

1. **`public.current_company_id()`**
   - **File:** `supabase/migrations/20260126000002_profiles_setup_and_rls.sql:11-19`
   - **Returns:** `company_id FROM public.profiles WHERE id = auth.uid()`
   - **For platform_admin:** Returns `NULL`

2. **`public.current_user_role()`**
   - **File:** `supabase/migrations/20260124190000_payments_ledger_overhaul.sql:54-62`
   - **Returns:** `role FROM public.profiles WHERE id = auth.uid()`
   - **For platform_admin:** Returns `'platform_admin'`

### RLS Policies

1. **stripe_event_ledger**
   - **File:** `supabase/migrations/20260311000001_create_stripe_event_ledger.sql:74-103`
   - **Policy:** `stripe_event_ledger_service_role_all` (service_role only)

2. **billing_subscription_history**
   - **File:** `supabase/migrations/20260311000003_create_billing_subscription_history.sql:74-100`
   - **Policy:** `billing_subscription_history_authenticated_select` (requires company_id)

3. **plan_limits**
   - **File:** `supabase/migrations/20260310080002_plan_limits_table.sql:91-111`
   - **Policy:** `plan_limits_select_authenticated` (all authenticated users)

4. **companies**
   - **Status:** No RLS policies found
   - **Risk:** Unknown if RLS is enabled or disabled

---

## C. Existing Reusable Functions

### Platform-Level RPCs Found

1. **`public.eval_invoices_overdue_all_companies(p_limit int)`**
   - **File:** `supabase/migrations/20260212000010_invoice_overdue_eval_cron_multitenant.sql:21-66`
   - **Type:** `SECURITY DEFINER`
   - **Access:** Iterates through ALL companies
   - **Grants:** `service_role` only (line 70)
   - **Purpose:** Cron job for processing overdue invoices across all tenants
   - **Reusable?** No - only granted to `service_role`, not `authenticated`

### Pattern Observed

- Most RPCs check `v_company_id IS NULL` and raise `'NO_COMPANY'` exception
- Example: `public.record_payment()` (line 113-114 in payments_ledger_overhaul.sql)
- No existing RPCs designed for platform_admin cross-tenant access

---

## D. Recommended Data-Access Design for Platform Dashboard v1

### Recommended Approach: **New SECURITY DEFINER RPC Functions**

**Rationale:**
1. **Companies table RLS status is unknown** - safer to use RPC than assume direct access
2. **Consistent with existing patterns** - other sensitive operations use SECURITY DEFINER RPCs
3. **Explicit control** - RPC functions can enforce `platform_admin` role check
4. **Future-proof** - Can add additional security/audit logic later
5. **Isolation** - Keeps platform admin access separate from tenant RLS policies

### Recommended RPC Functions

#### 1. `public.get_platform_companies_summary()`
**Purpose:** Return aggregated subscription statistics
**Returns:**
```sql
TABLE (
  total_companies bigint,
  active_subscriptions bigint,
  trialing_subscriptions bigint,
  past_due_unpaid bigint,
  inactive_canceled bigint
)
```

**Security:**
- `SECURITY DEFINER`
- Check: `IF public.current_user_role() <> 'platform_admin' THEN RAISE EXCEPTION 'FORBIDDEN'`
- Grant: `GRANT EXECUTE ON FUNCTION ... TO authenticated`

#### 2. `public.get_platform_recent_companies(p_limit int DEFAULT 50)`
**Purpose:** Return recent companies list with billing info
**Returns:**
```sql
TABLE (
  id uuid,
  name text,
  plan text,
  subscription_status text,
  trial_ends_at timestamptz,
  billing_updated_at timestamptz,
  created_at timestamptz
)
```

**Security:**
- `SECURITY DEFINER`
- Check: `IF public.current_user_role() <> 'platform_admin' THEN RAISE EXCEPTION 'FORBIDDEN'`
- Grant: `GRANT EXECUTE ON FUNCTION ... TO authenticated`
- Order by: `billing_updated_at DESC NULLS LAST, created_at DESC`

### Why Not Direct Table Reads?

1. **Companies table RLS is ambiguous** - may be enabled with no policies (blocks all reads)
2. **Consistency** - Other sensitive reads use RPCs (e.g., `get_company_plan_usage`)
3. **Security** - Explicit role check in RPC is clearer than RLS policy
4. **Future flexibility** - Can add filtering, pagination, audit logging in RPC

### Why Not Modify Existing RLS Policies?

1. **Risk of breaking tenant isolation** - Adding platform_admin to existing policies could accidentally allow cross-tenant access
2. **Complexity** - Would need to modify multiple policies across multiple tables
3. **Safety** - New RPCs keep platform access completely separate from tenant access

---

## E. Minimal Implementation Plan

### Phase 1: Create Platform RPC Functions (Migration)

**File:** `supabase/migrations/20260311000005_platform_admin_rpcs.sql`

**Functions to Create:**

1. **`public.get_platform_companies_summary()`**
   - Role check: `platform_admin` only
   - Query: Aggregate counts from `public.companies` grouped by `subscription_status`
   - Returns: Single row with all counts

2. **`public.get_platform_recent_companies(p_limit int)`**
   - Role check: `platform_admin` only
   - Query: Select from `public.companies` with billing fields
   - Order: `billing_updated_at DESC NULLS LAST, created_at DESC`
   - Limit: `p_limit` (default 50)
   - Returns: Array of company rows

**Grants:**
- `GRANT EXECUTE ON FUNCTION ... TO authenticated`
- Explicitly do NOT grant to `service_role` (keep platform admin separate from service operations)

### Phase 2: Frontend Integration

**File:** `src/pages/platform/PlatformDashboard.jsx`

**Data Fetching:**
- Call `supabase.rpc('get_platform_companies_summary')` for statistics
- Call `supabase.rpc('get_platform_recent_companies', { p_limit: 20 })` for recent companies list

**UI Components:**
- Statistics cards (total companies, active, trialing, past_due/unpaid, inactive/canceled)
- Recent companies table (name, plan, status, trial_ends_at, billing_updated_at)

### Security Considerations

1. **Role Enforcement:** Both RPCs check `current_user_role() = 'platform_admin'`
2. **No Tenant Data Leakage:** RPCs only read `companies` table (no jobs, customers, payments)
3. **Read-Only:** RPCs are SELECT-only, no writes
4. **Audit Trail:** Can add audit logging to RPCs in future if needed

### Alternative Approach (If Companies Table Has No RLS)

**If investigation reveals companies table has RLS disabled:**
- Could add single RLS policy: `platform_admin` can SELECT all companies
- **Risk:** Less explicit than RPC approach
- **Recommendation:** Still prefer RPC approach for consistency and future flexibility

---

## Summary

### Current State
- **companies:** RLS status unknown (likely disabled or no policies)
- **stripe_event_ledger:** service_role only (platform_admin blocked)
- **billing_subscription_history:** Requires company_id (platform_admin blocked)
- **plan_limits:** All authenticated users can read (platform_admin can access)

### Recommended Solution
- **Create 2 new SECURITY DEFINER RPC functions** for platform admin dashboard
- **Explicit role check:** `platform_admin` only
- **Read-only:** SELECT from companies table only
- **No RLS policy changes:** Keep platform access separate from tenant RLS

### Implementation Order
1. Create migration with 2 RPC functions
2. Update PlatformDashboard.jsx to call RPCs
3. Test with platform_admin user
4. Verify tenant admin cannot call these RPCs

---

**End of Investigation**
