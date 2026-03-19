# Quote Acceptance RPC Function Ambiguity Audit

**Date:** 2026-01-27  
**Issue:** Database error when accepting/rejecting quotes via public link  
**Error:** `Could not choose the best candidate function between: public.respond_to_quote_public(p_token => uuid, p_action => text, p_signer_name => text, p_comment => text), public.respond_to_quote_public(p_token => uuid, p_action => text, p_signer_name => text, p_comment => text, p_ip_address => text)`

---

## 1. Frontend RPC Call Analysis

### Files Calling `respond_to_quote_public`:

1. **`src/pages/public/PublicQuote.jsx`** (Lines 31-36, 111-116)
   - **Accept Quote Call:**
     ```javascript
     await supabase.rpc('respond_to_quote_public', {
       p_token: token,
       p_action: 'accept',
       p_signer_name: signerName.trim(),
       p_comment: comment.trim() || null
     })
     ```
   - **Reject Quote Call:**
     ```javascript
     await supabase.rpc('respond_to_quote_public', {
       p_token: token,
       p_action: 'reject',
       p_signer_name: signerName.trim(),
       p_comment: comment.trim() || null
     })
     ```

2. **`src/pages/customer/QuoteDetailPage.jsx`** (Lines 79-84, 122-127)
   - **Accept Quote Call:**
     ```javascript
     await supabase.rpc('respond_to_quote_public', {
       p_token: quote.public_token,
       p_action: 'accept',
       p_signer_name: signerName.trim(),
       p_comment: comment.trim() || null,
     })
     ```
   - **Reject Quote Call:**
     ```javascript
     await supabase.rpc('respond_to_quote_public', {
       p_token: quote.public_token,
       p_action: 'reject',
       p_signer_name: signerName.trim(),
       p_comment: comment.trim() || null,
     })
     ```

### Exact Payload Being Sent:
All frontend calls send **exactly 4 parameters**:
- `p_token` (uuid)
- `p_action` (text: 'accept' or 'reject')
- `p_signer_name` (text)
- `p_comment` (text, can be null)

**No `p_ip_address` parameter is sent from the frontend.**

---

## 2. Database Function Definitions

### Migration History:

The function `respond_to_quote_public` has been created/modified in multiple migrations:

1. **`20260130000001_quotes_public_accept_reject.sql`** (Initial creation)
   - 4 parameters: `p_token`, `p_action`, `p_signer_name`, `p_comment`

2. **`20260130000002_fix_public_quote_accept.sql`** (Fix)
   - 4 parameters: `p_token`, `p_action`, `p_signer_name`, `p_comment`
   - Drops old version before creating new one

3. **`20260130000003_fix_public_quote_accept_job_dates.sql`** (Fix)
   - 4 parameters: `p_token`, `p_action`, `p_signer_name`, `p_comment`
   - Drops old version before creating new one

4. **`20260131000002_fix_public_quote_accept_job_insert.sql`** (Fix)
   - 4 parameters: `p_token`, `p_action`, `p_signer_name`, `p_comment`
   - Drops old version before creating new one

5. **`20260131000003_fix_public_quote_accept_job_insert_v3.sql`** (Fix)
   - 4 parameters: `p_token`, `p_action`, `p_signer_name`, `p_comment`
   - Drops old version before creating new one

6. **`20260131122942_enforce_quote_validity_and_idempotency.sql`** (Enhancement)
   - 4 parameters: `p_token`, `p_action`, `p_signer_name`, `p_comment`
   - Uses `CREATE OR REPLACE` (does not drop old version explicitly)

7. **`20260206000000_fix_public_quote_accept_no_auto_schedule.sql`** (Fix)
   - 4 parameters: `p_token`, `p_action`, `p_signer_name`, `p_comment`
   - Uses `CREATE OR REPLACE`

8. **`20260206000009_add_audit_logging_to_rpcs.sql`** (Enhancement)
   - 4 parameters: `p_token`, `p_action`, `p_signer_name`, `p_comment`
   - Uses `CREATE OR REPLACE`

9. **`20260206000011_add_rate_limits_to_public_rpcs.sql`** (Enhancement)
   - **4 parameters**: `p_token`, `p_action`, `p_signer_name`, `p_comment`
   - Uses `CREATE OR REPLACE`
   - Adds rate limiting (without IP tracking)

10. **`20260208000000_harden_audit_rate_limit_monitoring.sql`** (Most Recent)
    - **5 parameters**: `p_token`, `p_action`, `p_signer_name`, `p_comment`, `p_ip_address text DEFAULT NULL`
    - Uses `CREATE OR REPLACE`
    - **Does NOT drop the old 4-parameter version**
    - Adds IP address tracking to rate limiting

### Current State:

**Both function versions exist in the database:**
- Version 1: `respond_to_quote_public(uuid, text, text, text)` - 4 parameters
- Version 2: `respond_to_quote_public(uuid, text, text, text, text)` - 5 parameters (with `p_ip_address DEFAULT NULL`)

When the frontend calls with 4 parameters, PostgreSQL cannot determine which function to use, causing the ambiguity error.

---

## 3. Function Comparison

### Version 1 (4 Parameters) - From `20260206000011_add_rate_limits_to_public_rpcs.sql`:
```sql
CREATE OR REPLACE FUNCTION public.respond_to_quote_public(
  p_token uuid,
  p_action text,
  p_signer_name text,
  p_comment text DEFAULT NULL
)
```
- Rate limiting: Uses `check_rate_limit(v_rate_limit_key, 'quote_respond', 5, 60)` (no IP parameter)
- No IP address tracking

### Version 2 (5 Parameters) - From `20260208000000_harden_audit_rate_limit_monitoring.sql`:
```sql
CREATE OR REPLACE FUNCTION public.respond_to_quote_public(
  p_token uuid,
  p_action text,
  p_signer_name text,
  p_comment text DEFAULT NULL,
  p_ip_address text DEFAULT NULL
)
```
- Rate limiting: Uses `check_rate_limit(v_rate_limit_key, 'quote_respond', 5, 60, p_ip_address)` (with IP parameter)
- IP address tracking: When `p_ip_address` is provided, it's used in rate limit key and stored in `rate_limit_events` table
- **Backward compatible**: `p_ip_address` has `DEFAULT NULL`, so 4-parameter calls work

### Key Differences:

1. **IP Address Parameter**: Version 2 adds optional `p_ip_address` parameter
2. **Rate Limiting Enhancement**: Version 2 passes IP address to `check_rate_limit` for better tracking
3. **Functionality**: Both versions perform the same core operations (accept/reject quote, create job, etc.)
4. **Compatibility**: Version 2 can handle both 4-parameter and 5-parameter calls

---

## 4. Analysis: Which Version Should Remain?

### Version 2 (5 Parameters) Should Remain Because:

1. **Most Recent**: Created in the latest migration (`20260208000000`)
2. **Enhanced Features**: Includes IP address tracking for better rate limiting
3. **Backward Compatible**: `p_ip_address` has `DEFAULT NULL`, so it works with 4-parameter calls
4. **Future-Proof**: Allows frontend to optionally pass IP address in the future
5. **Consistent with Other Functions**: Other public RPCs in the same migration also have `p_ip_address` parameter

### Version 1 (4 Parameters) Should Be Dropped Because:

1. **Obsolete**: Superseded by Version 2
2. **Causes Ambiguity**: Prevents PostgreSQL from choosing the correct function
3. **Missing Features**: Lacks IP address tracking capability
4. **No Longer Needed**: Version 2 can handle all use cases

### Is `p_ip_address` Actually Used?

**Yes, but it's optional:**
- When provided, it's used to build a composite rate limit key: `'quote_token:' || p_token || '|ip:' || p_ip_address`
- When NULL (default), rate limiting works without IP tracking: `'quote_token:' || p_token`
- The `check_rate_limit` function also accepts `p_ip_address text DEFAULT NULL`, so it works with or without it
- Currently, the frontend doesn't send IP addresses, so rate limiting works per token only

**Business Logic Impact:**
- **Current behavior**: Rate limiting is per quote token (shared across all IPs accessing the same quote)
- **With IP tracking**: Rate limiting could be per quote token + IP (more granular)
- **No breaking change**: Since `p_ip_address` defaults to NULL, existing behavior is preserved

---

## 5. Recommended Fix

### Option 1: Drop Old Function (Recommended)

**Cleanest solution**: Drop the obsolete 4-parameter version, keeping only the 5-parameter version.

**Rationale:**
- Version 2 is backward compatible (handles 4-parameter calls)
- No frontend changes needed
- Removes ambiguity
- Keeps enhanced features

**SQL Migration:**
```sql
BEGIN;

-- Drop the old 4-parameter version of respond_to_quote_public
DROP FUNCTION IF EXISTS public.respond_to_quote_public(uuid, text, text, text);

-- The 5-parameter version (with p_ip_address DEFAULT NULL) already exists
-- and can handle both 4-parameter and 5-parameter calls

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

**File:** `supabase/migrations/[TIMESTAMP]_fix_respond_to_quote_public_ambiguity.sql`

**Content:**
```sql
BEGIN;

-- =============================================================================
-- Fix: Remove obsolete 4-parameter version of respond_to_quote_public
-- =============================================================================
-- Problem: Two function overloads exist, causing ambiguity when frontend
--          calls with 4 parameters (no p_ip_address).
-- Solution: Drop the old 4-parameter version. The 5-parameter version
--           (with p_ip_address DEFAULT NULL) can handle both call patterns.
-- =============================================================================

-- Drop the obsolete 4-parameter version
DROP FUNCTION IF EXISTS public.respond_to_quote_public(uuid, text, text, text);

-- The 5-parameter version already exists from migration 20260208000000
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
  AND p.proname = 'respond_to_quote_public'
ORDER BY p.oid;
```

**Expected Result:** Only one row with 5 parameters (including `p_ip_address text DEFAULT NULL`)

---

## 7. Summary

### Files Involved:
- **Frontend:** `src/pages/public/PublicQuote.jsx`, `src/pages/customer/QuoteDetailPage.jsx`
- **Database:** Multiple migrations, but the issue is in `20260208000000_harden_audit_rate_limit_monitoring.sql` (didn't drop old version)

### Current Frontend RPC Payload:
```javascript
{
  p_token: uuid,
  p_action: 'accept' | 'reject',
  p_signer_name: string,
  p_comment: string | null
}
```
**4 parameters total - no `p_ip_address`**

### Function Version to Keep:
**5-parameter version** from migration `20260208000000_harden_audit_rate_limit_monitoring.sql`

### Exact SQL Migration Needed:
```sql
BEGIN;
DROP FUNCTION IF EXISTS public.respond_to_quote_public(uuid, text, text, text);
COMMIT;
```

### Safety:
- ✅ Safe: The 5-parameter version has `p_ip_address DEFAULT NULL`, so it handles 4-parameter calls
- ✅ No frontend changes needed
- ✅ No breaking changes
- ✅ Removes ambiguity
- ✅ Keeps enhanced features (IP tracking capability for future use)

---

**End of Audit Report**
