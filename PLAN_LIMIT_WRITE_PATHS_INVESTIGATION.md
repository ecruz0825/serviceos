# Plan Limit Write Paths Investigation

**Date:** Investigation Only (No Code Changes)  
**Goal:** Identify exact write paths for plan-limit enforcement (customers, crew members, jobs).

---

## 1. Customers - Write Paths

### Direct Inserts (Frontend)

**File:** `src/pages/admin/CustomersAdmin.jsx` (Lines 1121-1129)
```jsx
const { data: inserted, error } = await supabase
  .from('customers')
  .insert([{
    ...form,
    tags: normalizedTags,
    company_id: companyId,
    user_id: null,
  }])
  .select();
```

**Characteristics:**
- ✅ Direct `supabase.from('customers').insert()`
- ❌ No RPC function
- ❌ No edge function
- ✅ Tenant-scoped: `company_id` set at write time
- ⚠️ Server-side validation: RLS policies only (no explicit limit checks)

**File:** `src/CustomerDashboard.jsx` (Line 158)
```jsx
await supabase.from('customers').insert([form])
```

**Characteristics:**
- ✅ Direct `supabase.from('customers').insert()`
- ❌ No RPC function
- ❌ No edge function
- ⚠️ Tenant-scoping: Relies on RLS (no explicit `company_id` in form)
- ⚠️ Server-side validation: RLS policies only

### RPC Functions

**None found** - No RPC functions create customers directly.

### Edge Functions

**None found** - No edge functions create customers.

### Database Triggers

**File:** `supabase/migrations/20260221120001_guard_customers_user_id_role.sql`
- Trigger: `trg_guard_customer_user_id`
- Purpose: Validates `user_id` role assignments (security, not limits)

**File:** `supabase/migrations/20260221120002_harden_handle_new_user.sql`
- Function: `handle_new_user()` trigger
- Purpose: Auto-creates `profiles` row, may link to existing `crew_members` by email
- **Note:** Does not create `customers` records

### Bulk Creation Paths

**None found** - No CSV import, bulk insert, or seed scripts for customers.

---

## 2. Crew Members - Write Paths

### Direct Inserts (Frontend)

**File:** `src/pages/admin/CrewAdmin.jsx` (Lines 68-76)
```jsx
const { error } = await supabase
  .from('crew_members')
  .insert([{
    full_name: form.full_name,
    email: form.email || null,
    phone: form.phone || null,
    role: form.role || 'crew',
    company_id: companyId
  }]);
```

**Characteristics:**
- ✅ Direct `supabase.from('crew_members').insert()`
- ❌ No RPC function
- ❌ No edge function
- ✅ Tenant-scoped: `company_id` set at write time
- ⚠️ Server-side validation: RLS policies only (no explicit limit checks)

### RPC Functions

**None found** - No RPC functions create crew members directly.

### Edge Functions

**File:** `supabase/functions/invite-user/index.ts`
- **Purpose:** Sends invite email and creates auth user
- **Crew Creation:** Does NOT create `crew_members` record directly
- **Flow:** Creates auth user → `handle_new_user` trigger creates profile → May link to existing `crew_members` by email (if `crew_member_id` provided)
- **Note:** The edge function accepts `crew_member_id` parameter but does not create the crew member record itself

### Database Triggers

**File:** `supabase/migrations/20260221120002_harden_handle_new_user.sql`
- Function: `handle_new_user()` trigger (runs on `auth.users` INSERT)
- **Crew Linking:** If `crew_member_id` is provided in `raw_user_meta_data`, links profile to existing crew member
- **Note:** Does not create new `crew_members` records

### Bulk Creation Paths

**None found** - No CSV import, bulk insert, or seed scripts for crew members.

---

## 3. Jobs - Write Paths

### Direct Inserts (Frontend)

**File:** `src/pages/admin/JobsAdmin.jsx` (Line 875)
```jsx
const { data, error } = await supabase.from('jobs').insert([payload]).select().single();
```

**Characteristics:**
- ✅ Direct `supabase.from('jobs').insert()`
- ❌ No RPC function (for creation)
- ❌ No edge function
- ✅ Tenant-scoped: `company_id` included in payload
- ⚠️ Server-side validation: RLS policies only (no explicit limit checks)

**File:** `src/CustomerDashboard.jsx` (Line 429)
```jsx
({ error } = await supabase.from('jobs').insert([jobData]))
```

**Characteristics:**
- ✅ Direct `supabase.from('jobs').insert()`
- ❌ No RPC function
- ❌ No edge function
- ✅ Tenant-scoped: `company_id` included in `jobData`
- ⚠️ Server-side validation: RLS policies only

**File:** `src/pages/admin/CustomersAdmin.jsx` (Line 1640)
```jsx
const { error } = await supabase.from('jobs').insert([job]);
```

**Characteristics:**
- ✅ Direct `supabase.from('jobs').insert()`
- ❌ No RPC function
- ❌ No edge function
- ✅ Tenant-scoped: `company_id` included in job object
- ⚠️ Server-side validation: RLS policies only

### RPC Functions (Job Creation)

**File:** `supabase/migrations/20260206000004_admin_convert_quote_to_job.sql`
- **Function:** `admin_convert_quote_to_job(p_quote_id uuid)`
- **Lines 91-112:**
```sql
INSERT INTO public.jobs (
  company_id,
  customer_id,
  service_date,
  scheduled_end_date,
  services_performed,
  job_cost,
  status,
  assigned_team_id,
  notes
) VALUES (
  v_quote.company_id,
  v_quote.customer_id,
  NULL,
  NULL,
  'From Quote ' || v_quote.quote_number,
  COALESCE(v_quote.total, 0),
  'Pending',
  NULL,
  v_job_notes
)
RETURNING id INTO v_job_id;
```

**Characteristics:**
- ✅ RPC function with `SECURITY DEFINER`
- ✅ Tenant-scoped: Uses `v_quote.company_id`
- ⚠️ Server-side validation: Role check (admin/manager/dispatcher), no limit checks
- **Usage:** `src/pages/admin/QuoteBuilder.jsx` line 263

**File:** `supabase/migrations/20260201000000_job_schedule_requests.sql`
- **Function:** `request_job_schedule_public(...)`
- **Purpose:** Creates job from public schedule request
- **Note:** Creates job via direct INSERT within RPC

### Edge Functions (Job Creation)

**File:** `supabase/functions/auto-generate-recurring-jobs/index.ts` (Lines 163-171)
```typescript
const { error: insErr } = await supabase.from("jobs").insert({
  company_id: row.company_id,
  customer_id: row.customer_id,
  recurring_job_id: row.id,
  service_date: serviceDate,
  status: "Pending",
  services_performed: "Recurring service",
  job_cost: 0,
});
```

**Characteristics:**
- ✅ Edge function (Deno/TypeScript)
- ✅ Uses service role client (bypasses RLS)
- ✅ Tenant-scoped: `company_id` from recurring job
- ⚠️ Server-side validation: Checks for existing job (duplicate prevention), no limit checks
- **Trigger:** Scheduled (can be called via cron or manually)

### Recurring Job Generation (Frontend)

**File:** `src/utils/jobGenerators.js` (Lines 12-19)
```jsx
const { error: insertError } = await supabase.from('jobs').insert([{
  customer_id: job.customer_id,
  service_date: today,
  services_performed: job.services_performed,
  job_cost: job.job_cost,
  recurring_job_id: job.id,
  company_id: job.company_id
}]);
```

**Characteristics:**
- ✅ Direct `supabase.from('jobs').insert()`
- ❌ No RPC function
- ❌ No edge function
- ✅ Tenant-scoped: `company_id` included
- ⚠️ Server-side validation: RLS policies only
- **Usage:** Called from `src/pages/admin/AdminDashboard.jsx` (line 17) and `src/AdminDashboard.jsx` (line 4)

**File:** `src/pages/admin/RecurringJobsAdmin.jsx` (Lines 186-196)
```jsx
const { error: insertError } = await supabase.from('jobs').insert([
  {
    customer_id: job.customer_id,
    company_id: job.company_id,
    service_date: nextDate.toISOString().split("T")[0],
    services_performed: job.services_performed,
    job_cost: job.job_cost,
    recurring_job_id: job.id,
    assigned_team_id: job.default_team_id || null,
  }
]);
```

**Characteristics:**
- ✅ Direct `supabase.from('jobs').insert()`
- ❌ No RPC function
- ❌ No edge function
- ✅ Tenant-scoped: `company_id` included
- ⚠️ Server-side validation: RLS policies only

### Database Triggers

**File:** `supabase/migrations/20260126193000_ab5_jobs_scheduled_end_date.sql`
- Trigger: `trg_jobs_set_default_end_date`
- Purpose: Sets default `scheduled_end_date` (not creation-related)

**File:** `supabase/migrations/20260127000003_guard_jobs_assigned_to_legacy.sql`
- Trigger: `block_jobs_assigned_to_write_trigger`
- Purpose: Blocks writes to legacy `assigned_to` column (migration safety, not limits)

**File:** `supabase/migrations/20260208000000_harden_audit_rate_limit_monitoring.sql`
- Trigger: `trg_log_job_created_from_quote`
- Purpose: Logs audit event when job created from quote (audit, not limits)

### Bulk Creation Paths

**None found** - No CSV import or bulk insert scripts for jobs.

---

## 4. Summary of Write Paths

### Customers
| Path | Method | Tenant-Scoped | Server Validation |
|------|--------|---------------|-------------------|
| `CustomersAdmin.jsx` | Direct insert | ✅ Yes (`company_id`) | RLS only |
| `CustomerDashboard.jsx` | Direct insert | ⚠️ RLS only | RLS only |

### Crew Members
| Path | Method | Tenant-Scoped | Server Validation |
|------|--------|---------------|-------------------|
| `CrewAdmin.jsx` | Direct insert | ✅ Yes (`company_id`) | RLS only |
| `invite-user` edge function | Creates auth user only | N/A | Role validation |

### Jobs
| Path | Method | Tenant-Scoped | Server Validation |
|------|--------|---------------|-------------------|
| `JobsAdmin.jsx` | Direct insert | ✅ Yes (`company_id`) | RLS only |
| `CustomerDashboard.jsx` | Direct insert | ✅ Yes (`company_id`) | RLS only |
| `CustomersAdmin.jsx` | Direct insert | ✅ Yes (`company_id`) | RLS only |
| `admin_convert_quote_to_job` RPC | INSERT in RPC | ✅ Yes (`company_id`) | Role check only |
| `auto-generate-recurring-jobs` edge function | Direct insert (service role) | ✅ Yes (`company_id`) | Duplicate check only |
| `jobGenerators.js` | Direct insert | ✅ Yes (`company_id`) | RLS only |
| `RecurringJobsAdmin.jsx` | Direct insert | ✅ Yes (`company_id`) | RLS only |

---

## 5. Final Section

### A) Best Enforcement Point for Customer Limits

**Recommended: Database Trigger (BEFORE INSERT)**

**Rationale:**
1. **Single point of enforcement** - All customer creation paths go through `INSERT INTO customers`
2. **Cannot be bypassed** - Works even if frontend validation is skipped
3. **Consistent** - Applies to all write paths (admin UI, customer dashboard, future APIs)
4. **Tenant-aware** - Can check `company_id` and query plan limits

**Implementation:**
```sql
CREATE OR REPLACE FUNCTION check_customer_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_plan text;
  v_max_customers int;
  v_current_count int;
BEGIN
  -- Get company plan
  SELECT plan INTO v_plan FROM companies WHERE id = NEW.company_id;
  
  -- Get limit for plan (from plan_limits table or CASE statement)
  v_max_customers := get_customer_limit_for_plan(v_plan);
  
  -- Count current customers
  SELECT COUNT(*) INTO v_current_count
  FROM customers
  WHERE company_id = NEW.company_id;
  
  -- Enforce limit
  IF v_current_count >= v_max_customers THEN
    RAISE EXCEPTION 'CUSTOMER_LIMIT_EXCEEDED' USING
      MESSAGE = format('Customer limit (%s) reached for plan %s', v_max_customers, v_plan);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_customer_limit
BEFORE INSERT ON customers
FOR EACH ROW
EXECUTE FUNCTION check_customer_limit();
```

**Alternative (if triggers are not preferred):** RPC function `create_customer(...)` that wraps the INSERT with limit checks. However, this requires refactoring all frontend code to use the RPC instead of direct inserts.

### B) Best Enforcement Point for Crew Limits

**Recommended: Database Trigger (BEFORE INSERT)**

**Rationale:**
1. **Single point of enforcement** - All crew creation goes through `INSERT INTO crew_members`
2. **Cannot be bypassed** - Works even if frontend validation is skipped
3. **Handles edge function path** - Even if `invite-user` edge function is modified to create crew members, trigger will catch it
4. **Tenant-aware** - Can check `company_id` and query plan limits

**Implementation:**
```sql
CREATE OR REPLACE FUNCTION check_crew_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_plan text;
  v_max_crew int;
  v_current_count int;
BEGIN
  -- Get company plan
  SELECT plan INTO v_plan FROM companies WHERE id = NEW.company_id;
  
  -- Get limit for plan
  v_max_crew := get_crew_limit_for_plan(v_plan);
  
  -- Count current crew
  SELECT COUNT(*) INTO v_current_count
  FROM crew_members
  WHERE company_id = NEW.company_id;
  
  -- Enforce limit
  IF v_current_count >= v_max_crew THEN
    RAISE EXCEPTION 'CREW_LIMIT_EXCEEDED' USING
      MESSAGE = format('Crew limit (%s) reached for plan %s', v_max_crew, v_plan);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_crew_limit
BEFORE INSERT ON crew_members
FOR EACH ROW
EXECUTE FUNCTION check_crew_limit();
```

**Alternative:** RPC function `create_crew_member(...)`, but requires refactoring `CrewAdmin.jsx` to use RPC instead of direct insert.

### C) Best Enforcement Point for Monthly Job Limits

**Recommended: Hybrid Approach (Trigger + RPC Validation)**

**Rationale:**
1. **Multiple write paths** - Jobs created via direct inserts, RPCs, and edge functions
2. **Monthly window** - Requires date-based counting (jobs created in current month)
3. **Recurring jobs** - Edge function can create many jobs at once (needs batch validation)

**Implementation Options:**

**Option 1: Database Trigger (BEFORE INSERT)**
```sql
CREATE OR REPLACE FUNCTION check_monthly_job_limit()
RETURNS TRIGGER AS $$
DECLARE
  v_plan text;
  v_max_jobs_per_month int;
  v_current_month_count int;
  v_month_start date;
BEGIN
  -- Get company plan
  SELECT plan INTO v_plan FROM companies WHERE id = NEW.company_id;
  
  -- Get limit for plan
  v_max_jobs_per_month := get_monthly_job_limit_for_plan(v_plan);
  
  -- Calculate month start
  v_month_start := date_trunc('month', CURRENT_DATE)::date;
  
  -- Count jobs created this month
  SELECT COUNT(*) INTO v_current_month_count
  FROM jobs
  WHERE company_id = NEW.company_id
    AND created_at >= v_month_start;
  
  -- Enforce limit
  IF v_current_month_count >= v_max_jobs_per_month THEN
    RAISE EXCEPTION 'MONTHLY_JOB_LIMIT_EXCEEDED' USING
      MESSAGE = format('Monthly job limit (%s) reached for plan %s', v_max_jobs_per_month, v_plan);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_monthly_job_limit
BEFORE INSERT ON jobs
FOR EACH ROW
EXECUTE FUNCTION check_monthly_job_limit();
```

**Option 2: RPC Function for Batch Creation**
- Modify `auto-generate-recurring-jobs` edge function to check limit before batch insert
- Modify `admin_convert_quote_to_job` RPC to check limit before insert
- Keep trigger for direct frontend inserts

**Recommendation:** Use **Option 1 (Trigger)** for consistency, but add limit check in `auto-generate-recurring-jobs` edge function to fail gracefully if batch would exceed limit.

### D) Which Write Paths Would Be Bypassed if We Enforced Limits Only in the Frontend?

**All of them.** Frontend-only enforcement would be bypassed by:

1. **Direct API calls** - Users can call Supabase client directly from browser console
2. **Edge functions** - `auto-generate-recurring-jobs` uses service role (bypasses RLS and frontend)
3. **RPC functions** - `admin_convert_quote_to_job` runs server-side (bypasses frontend)
4. **Database tools** - Direct SQL access (if available)
5. **API clients** - Postman, curl, or other HTTP clients calling Supabase REST API
6. **Future integrations** - Webhooks, third-party apps, mobile apps

**Critical Bypass Paths:**
- ✅ `auto-generate-recurring-jobs` edge function (service role, no frontend)
- ✅ `admin_convert_quote_to_job` RPC (server-side, no frontend)
- ✅ Any future scheduled jobs or webhooks
- ✅ Direct Supabase client usage from browser console

**Conclusion:** Frontend-only enforcement is **not secure**. Limits must be enforced at the database level (triggers) or in server-side functions (RPCs/edge functions) to prevent bypass.

---

## Summary

- **Customers:** 2 direct insert paths (both tenant-scoped, RLS only)
- **Crew Members:** 1 direct insert path (tenant-scoped, RLS only)
- **Jobs:** 7 write paths (direct inserts, RPCs, edge functions - all tenant-scoped, minimal validation)
- **Bulk Creation:** None found for customers/crew; recurring job generation for jobs
- **Best Enforcement:** Database triggers (BEFORE INSERT) for all resources
- **Frontend-Only Enforcement:** Would be bypassed by all server-side paths and direct API access
