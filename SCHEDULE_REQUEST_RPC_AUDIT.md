# Public Schedule Request RPC Function Ambiguity Audit

**Date:** 2026-01-27  
**Issue:** Database error when submitting schedule requests via public link  
**Error:** `Could not choose the best candidate function between: public.request_job_schedule_public(...3 args...), public.request_job_schedule_public(...4 args including p_ip_address...)`

---

## 1. Frontend RPC Call Analysis

### Files Calling `request_job_schedule_public`:

1. **`src/pages/public/PublicJobScheduleRequest.jsx`** (Lines 136-140)
   - **Submit Schedule Request Call:**
     ```javascript
     await supabase.rpc('request_job_schedule_public', {
       p_token: token,
       p_requested_date: requestedDate,
       p_customer_note: customerNote.trim() || null
     })
     ```

### Exact Payload Being Sent:
The frontend sends **exactly 3 parameters**:
- `p_token` (uuid)
- `p_requested_date` (date string in YYYY-MM-DD format)
- `p_customer_note` (text, can be null)

**No `p_ip_address` parameter is sent from the frontend.**

---

## 2. Database Function Definitions

### Migration History:

The function `request_job_schedule_public` has been created/modified in multiple migrations:

1. **`20260201000000_job_schedule_requests.sql`** (Initial creation)
   - 3 parameters: `p_token`, `p_requested_date`, `p_customer_note`
   - Returns: `jsonb` with `ok`, `request_id`, `requested_date`

2. **`20260201000001_schedule_request_notifications.sql`** (Enhancement)
   - 3 parameters: `p_token`, `p_requested_date`, `p_customer_note`
   - Uses `CREATE OR REPLACE`

3. **`20260206000002_enforce_one_open_schedule_request_per_job.sql`** (Enhancement)
   - 3 parameters: `p_token`, `p_requested_date`, `p_customer_note`
   - Uses `CREATE OR REPLACE`
   - Adds check for existing open requests

4. **`20260206000003_harden_request_job_schedule_public_block_if_scheduled.sql`** (Enhancement)
   - 3 parameters: `p_token`, `p_requested_date`, `p_customer_note`
   - Uses `CREATE OR REPLACE`
   - Blocks requests if job is already scheduled

5. **`20260206000011_add_rate_limits_to_public_rpcs.sql`** (Enhancement)
   - **3 parameters**: `p_token`, `p_requested_date`, `p_customer_note`
   - Uses `CREATE OR REPLACE`
   - Adds rate limiting (without IP tracking)

6. **`20260208000000_harden_audit_rate_limit_monitoring.sql`** (Most Recent)
   - **4 parameters**: `p_token`, `p_requested_date`, `p_customer_note`, `p_ip_address text DEFAULT NULL`
   - Uses `CREATE OR REPLACE`
   - **Does NOT drop the old 3-parameter version**
   - Adds IP address tracking to rate limiting

### Current State:

**Both function versions exist in the database:**
- Version 1: `request_job_schedule_public(uuid, date, text)` - 3 parameters
- Version 2: `request_job_schedule_public(uuid, date, text, text)` - 4 parameters (with `p_ip_address DEFAULT NULL`)

When the frontend calls with 3 parameters, PostgreSQL cannot determine which function to use, causing the ambiguity error.

---

## 3. Function Comparison

### Version 1 (3 Parameters) - From `20260206000011_add_rate_limits_to_public_rpcs.sql`:
```sql
CREATE OR REPLACE FUNCTION public.request_job_schedule_public(
  p_token uuid,
  p_requested_date date,
  p_customer_note text DEFAULT NULL
)
```
- Rate limiting: Uses `check_rate_limit(v_rate_limit_key, 'schedule_request', 5, 60)` (no IP parameter)
- No IP address tracking

### Version 2 (4 Parameters) - From `20260208000000_harden_audit_rate_limit_monitoring.sql`:
```sql
CREATE OR REPLACE FUNCTION public.request_job_schedule_public(
  p_token uuid,
  p_requested_date date,
  p_customer_note text DEFAULT NULL,
  p_ip_address text DEFAULT NULL
)
```
- Rate limiting: Uses `check_rate_limit(v_rate_limit_key, 'schedule_request', 5, 60, p_ip_address)` (with IP parameter)
- IP address tracking: When `p_ip_address` is provided, it's used in rate limit key and stored in `rate_limit_events` table
- **Backward compatible**: `p_ip_address` has `DEFAULT NULL`, so 3-parameter calls work

### Key Differences:

1. **IP Address Parameter**: Version 2 adds optional `p_ip_address` parameter
2. **Rate Limiting Enhancement**: Version 2 passes IP address to `check_rate_limit` for better tracking
3. **Functionality**: Both versions perform the same core operations (validate quote, check job status, create schedule request, etc.)
4. **Compatibility**: Version 2 can handle both 3-parameter and 4-parameter calls

---

## 4. Analysis: Which Version Should Remain?

### Version 2 (4 Parameters) Should Remain Because:

1. **Most Recent**: Created in the latest migration (`20260208000000`)
2. **Enhanced Features**: Includes IP address tracking for better rate limiting
3. **Backward Compatible**: `p_ip_address` has `DEFAULT NULL`, so it works with 3-parameter calls
4. **Future-Proof**: Allows frontend to optionally pass IP address in the future
5. **Consistent with Other Functions**: Other public RPCs in the same migration also have `p_ip_address` parameter (e.g., `respond_to_quote_public`, `mark_quote_viewed_public`)

### Version 1 (3 Parameters) Should Be Dropped Because:

1. **Obsolete**: Superseded by Version 2
2. **Causes Ambiguity**: Prevents PostgreSQL from choosing the correct function
3. **Missing Features**: Lacks IP address tracking capability
4. **No Longer Needed**: Version 2 can handle all use cases

### Is `p_ip_address` Actually Used?

**Yes, but it's optional:**
- When provided, it's used to build a composite rate limit key: `'schedule_token:' || p_token || '|ip:' || p_ip_address`
- When NULL (default), rate limiting works without IP tracking: `'schedule_token:' || p_token`
- The `check_rate_limit` function also accepts `p_ip_address text DEFAULT NULL`, so it works with or without it
- Currently, the frontend doesn't send IP addresses, so rate limiting works per token only

**Business Logic Impact:**
- **Current behavior**: Rate limiting is per quote token (shared across all IPs accessing the same quote)
- **With IP tracking**: Rate limiting could be per quote token + IP (more granular)
- **No breaking change**: Since `p_ip_address` defaults to NULL, existing behavior is preserved

---

## 5. Recommended Fix

### Option 1: Drop Old Function (Recommended)

**Cleanest solution**: Drop the obsolete 3-parameter version, keeping only the 4-parameter version.

**Rationale:**
- Version 2 is backward compatible (handles 3-parameter calls)
- No frontend changes needed
- Removes ambiguity
- Keeps enhanced features

**SQL Migration:**
```sql
BEGIN;

-- Drop the old 3-parameter version of request_job_schedule_public
DROP FUNCTION IF EXISTS public.request_job_schedule_public(uuid, date, text);

-- The 4-parameter version (with p_ip_address DEFAULT NULL) already exists
-- and can handle both 3-parameter and 4-parameter calls

COMMIT;
```

### Option 2: Rename One Function (Not Recommended)

**Alternative**: Rename one function to avoid ambiguity.

**Why Not Recommended:**
- Requires frontend changes
- More complex migration
- Unnecessary if Option 1 works

---

## 6. Implementation Details

### Exact Migration File Needed:

**File:** `supabase/migrations/[TIMESTAMP]_fix_request_job_schedule_public_ambiguity.sql`

**Content:**
```sql
BEGIN;

-- =============================================================================
-- Fix: Remove obsolete 3-parameter version of request_job_schedule_public
-- =============================================================================
-- Problem: Two function overloads exist, causing ambiguity when frontend
--          calls with 3 parameters (no p_ip_address).
-- Solution: Drop the old 3-parameter version. The 4-parameter version
--           (with p_ip_address DEFAULT NULL) can handle both call patterns.
-- =============================================================================

-- Drop the obsolete 3-parameter version
DROP FUNCTION IF EXISTS public.request_job_schedule_public(uuid, date, text);

-- The 4-parameter version already exists from migration 20260208000000
-- and will handle all calls (with or without p_ip_address)

COMMIT;
```

### Verification Query:

After applying the migration, verify only one version exists:
```sql
SELECT 
  p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname = 'request_job_schedule_public'
ORDER BY p.oid;
```

**Expected Result:** Only one row with 4 parameters (including `p_ip_address text DEFAULT NULL`)

---

## 7. Summary

### Files Involved:
- **Frontend:** `src/pages/public/PublicJobScheduleRequest.jsx`
- **Database:** Multiple migrations, but the issue is in `20260208000000_harden_audit_rate_limit_monitoring.sql` (didn't drop old version)

### Current Frontend RPC Payload:
```javascript
{
  p_token: uuid,
  p_requested_date: string, // YYYY-MM-DD format
  p_customer_note: string | null
}
```
**3 parameters total - no `p_ip_address`**

### Function Version to Keep:
**4-parameter version** from migration `20260208000000_harden_audit_rate_limit_monitoring.sql`

### Exact SQL Migration Needed:
```sql
BEGIN;
DROP FUNCTION IF EXISTS public.request_job_schedule_public(uuid, date, text);
COMMIT;
```

### Safety:
- ✅ Safe: The 4-parameter version has `p_ip_address DEFAULT NULL`, so it handles 3-parameter calls
- ✅ No frontend changes needed
- ✅ No breaking changes
- ✅ Removes ambiguity
- ✅ Keeps enhanced features (IP tracking capability for future use)

---

**End of Audit Report**
