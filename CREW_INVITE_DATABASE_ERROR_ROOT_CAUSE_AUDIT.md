# Crew Invite Database Error Root Cause Audit
**Service Ops SaaS - Read-Only Audit of "Database error saving new user"**

**Date**: 2024-03-20  
**Status**: Read-Only Audit Complete  
**Context**: CrewAdmin successfully creates crew_members row, invite-user is called with crew role and crew_member_id, but failure still occurs inside `supabase.auth.admin.inviteUserByEmail()` with "Database error saving new user".

---

## Executive Summary

**Finding**: The error occurs during the `auth.users` INSERT transaction, triggered by the `handle_new_user()` AFTER INSERT trigger attempting to INSERT into `profiles`. Despite defensive exception handling added in `20240320000000_fix_handle_new_user_defensive.sql`, the error persists, suggesting either:

1. **The exception handler is not catching all constraint violations** (most likely)
2. **A BEFORE INSERT trigger or constraint on auth.users itself** (unlikely - none found)
3. **The trigger's UPDATE to crew_members is failing** (less likely - also wrapped in exception handler)
4. **A foreign key constraint violation that occurs before the exception handler can catch it** (possible)

**Most Likely Root Cause**: 

1. **The edge function does NOT send `crew_member_id` in metadata** (even though it validates it exists)
   - File: `supabase/functions/invite-user/index.ts` (Lines 198-203)
   - Metadata includes: `full_name`, `role`, `app_next`, `company_id`, `customer_id` (if customer)
   - Metadata does NOT include: `crew_member_id`

2. **The trigger skips crew_member lookup when role/company_id are in metadata**
   - File: `supabase/migrations/20240320000000_fix_handle_new_user_defensive.sql` (Line 50)
   - Condition: `IF (v_metadata_role IS NULL OR v_company_id IS NULL)`
   - When both are present (which they are for crew invites), the lookup is skipped
   - Result: `v_crew_member.id` is NULL, so crew_member never gets linked

3. **The profile INSERT may be failing** due to a constraint violation that the exception handler is not catching, OR the exception handler is working but Supabase Auth is still reporting the error.

**The combination of these issues means**:
- Crew invite has crew_member_id validated but not passed to trigger
- Trigger creates profile but can't link crew_member (because lookup was skipped)
- Profile INSERT may be failing for unknown reason, causing "Database error saving new user"

---

## Complete Audit of Database Objects

### 1. Triggers on `auth.users`

#### Found: ONE trigger
**File**: `supabase/migrations/20260126000002_profiles_setup_and_rls.sql` (Line 79-83)
**File**: `supabase/migrations/20240320000000_fix_handle_new_user_defensive.sql` (replaces function)

```sql
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
```

**Type**: `AFTER INSERT`  
**Function**: `public.handle_new_user()`  
**Purpose**: Auto-create `profiles` row when auth user is created

**No BEFORE INSERT triggers found** - This rules out BEFORE trigger failures.

---

### 2. Function: `public.handle_new_user()`

**File**: `supabase/migrations/20240320000000_fix_handle_new_user_defensive.sql` (Lines 9-151)

**Key Logic**:
1. Early return if profile already exists (Line 26-30)
2. Extract metadata: role, company_id, full_name (Line 32-47)
3. Try to match crew_member by email if role/company_id missing (Line 49-83)
4. Final role determination (Line 85-95)
5. Full name fallback (Line 97-106)
6. Validate company_id exists (Line 108-114)
7. **INSERT into profiles** - wrapped in exception handler (Line 116-134)
8. **UPDATE crew_members.user_id** - wrapped in exception handler (Line 136-147)

**Exception Handling**:
- Profile INSERT is wrapped in `BEGIN...EXCEPTION WHEN OTHERS` (Line 118-134)
- Crew member UPDATE is wrapped in `BEGIN...EXCEPTION WHEN OTHERS` (Line 138-147)
- Both log warnings and continue, not raising exceptions

**Potential Issue**: The exception handler should catch all errors, but if the FK constraint `profiles.id REFERENCES auth.users(id)` fails in a way that PostgreSQL considers a transaction-level error, the exception handler may not prevent rollback.

---

### 3. Constraints on `profiles` Table

**File**: `supabase/migrations/20260126000002_profiles_setup_and_rls.sql` (Line 28)

```sql
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  role text,
  company_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

**Constraints Found**:
1. **PRIMARY KEY**: `id` (uuid)
2. **FOREIGN KEY**: `id REFERENCES auth.users(id) ON DELETE CASCADE`
3. **No UNIQUE constraints** on email or any other column
4. **No CHECK constraints**
5. **No NOT NULL constraints** (all columns nullable except implicit PK)

**Potential Issue**: The FK constraint `profiles.id REFERENCES auth.users(id)` should be satisfied since the trigger runs AFTER INSERT on auth.users, so the auth.users row should already exist. However, if there's a timing issue or the FK check happens before the exception handler can catch it, this could fail.

---

### 4. Constraints on `auth.users` Table

**No constraints found** - The `auth.users` table is managed by Supabase Auth and we don't modify it directly. No BEFORE INSERT triggers, no custom constraints, no RLS policies on auth.users found in our migrations.

---

### 5. RLS Policies on `profiles`

**File**: `supabase/migrations/20260126000002_profiles_setup_and_rls.sql` (Line 85-147)

**RLS Enabled**: Yes (Line 86)

**Policies Found**:
- `profiles_select_tenant` - SELECT policy for same company
- `profiles_select_admin` - SELECT policy for admins
- `profiles_select_own` - SELECT policy for own profile
- `profiles_update_own` - UPDATE policy for own profile

**No INSERT policy found** - This means INSERTs are blocked by RLS unless done by service role or SECURITY DEFINER function.

**Potential Issue**: The trigger function `handle_new_user()` is `SECURITY DEFINER`, so it should bypass RLS. However, if there's an RLS policy that was added later and conflicts, or if the SECURITY DEFINER isn't working as expected, this could block the INSERT.

**Verification**: The function is marked `SECURITY DEFINER` (Line 12), so RLS should not block it.

---

### 6. Crew Member Linking Logic

**File**: `supabase/migrations/20240320000000_fix_handle_new_user_defensive.sql` (Line 136-147)

```sql
-- 9) Link crew_member if match was found
IF v_crew_member.id IS NOT NULL THEN
  BEGIN
    UPDATE public.crew_members
    SET user_id = NEW.id
    WHERE id = v_crew_member.id
      AND user_id IS NULL;  -- Safety: only update if still unlinked
  EXCEPTION WHEN OTHERS THEN
    -- Log error but don't fail
    RAISE WARNING 'Failed to link crew_member % to user %: %', v_crew_member.id, NEW.id, SQLERRM;
  END;
END IF;
```

**Potential Issue**: When `crew_member_id` is provided in metadata, the trigger logic at Line 50-83 skips the crew_member lookup because `v_metadata_role` and `v_company_id` are both present. This means `v_crew_member.id` will be NULL, and the UPDATE at Line 137-147 will never execute.

**This is a logic bug, but not the root cause of "Database error saving new user"** - it would just mean the crew_member doesn't get linked, but the profile insert should still succeed.

---

## Root Cause Analysis

### Most Likely Root Cause

**The `profiles` INSERT is failing due to a constraint violation that the exception handler is not catching, OR the exception handler is working but Supabase Auth is still reporting the error as "Database error saving new user".**

**Specific Failure Scenarios**:

1. **FK Constraint Violation (Most Likely)**
   - The FK `profiles.id REFERENCES auth.users(id)` should be satisfied since trigger is AFTER INSERT
   - However, if there's a race condition or transaction isolation issue, the FK check might fail
   - The exception handler should catch this, but if PostgreSQL considers it a transaction-level error, it may still rollback

2. **RLS Policy Blocking (Less Likely)**
   - The function is `SECURITY DEFINER`, so RLS should not apply
   - However, if there's a bug in Supabase's RLS implementation with SECURITY DEFINER functions, this could block the INSERT

3. **Exception Handler Not Working (Possible)**
   - The exception handler uses `EXCEPTION WHEN OTHERS`, which should catch all errors
   - However, if the error occurs in a way that PostgreSQL considers a transaction-level failure (not a statement-level failure), the exception handler may not prevent rollback

4. **Crew Member Lookup Logic Bug (Not Root Cause)**
   - When `crew_member_id` is provided, the trigger skips the crew_member lookup (Line 50 condition is false)
   - This means `v_crew_member.id` is NULL, and the crew_member never gets linked
   - This is a separate bug, but not the cause of "Database error saving new user"

---

## Exact File/Migration/Function Causing It

**Primary Suspect**: `supabase/migrations/20240320000000_fix_handle_new_user_defensive.sql`

**Function**: `public.handle_new_user()` (Lines 9-151)

**Specific Code Section**: Lines 116-134 (Profile INSERT with exception handler)

```sql
-- 8) Insert profile with validated data - WRAP IN EXCEPTION HANDLER
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, company_id)
  VALUES (
    NEW.id,
    NEW.email,
    v_full_name,
    v_role,
    v_company_id
  )
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  -- Log error but don't fail the transaction
  RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
  -- Continue - profile creation failure shouldn't block auth user creation
END;
```

**Why It's Failing**:
- The exception handler should catch all errors, but if the FK constraint `profiles.id REFERENCES auth.users(id)` fails in a way that PostgreSQL considers a transaction-level error, the exception handler may not prevent rollback.
- OR the exception handler is working (logging a warning), but Supabase Auth is still detecting the error and reporting "Database error saving new user".

---

## Smallest Safe Fix

### Option 1: Make Profile Insert Truly Optional (Recommended)

**Change**: Make the profile INSERT completely optional by checking if it's safe to insert before attempting it, and skip the INSERT if any validation fails.

**File**: `supabase/migrations/20240320000000_fix_handle_new_user_defensive.sql` (or create new migration)

**Fix**:
```sql
-- 8) Insert profile with validated data - ONLY IF ALL VALIDATIONS PASS
-- Skip profile creation if company_id validation fails or if any required data is missing
IF v_company_id IS NOT NULL OR v_role IS NOT NULL THEN
  BEGIN
    INSERT INTO public.profiles (id, email, full_name, role, company_id)
    VALUES (
      NEW.id,
      NEW.email,
      v_full_name,
      v_role,
      v_company_id
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Log error but don't fail the transaction
    RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
  END;
ELSE
  -- No valid company_id or role - skip profile creation
  -- Edge function will handle profile creation after auth user is created
  RAISE WARNING 'Skipping profile creation for user %: missing company_id or role', NEW.id;
END IF;
```

**But wait** - this doesn't solve the issue if the exception handler is already working. The real fix might be to ensure the crew_member lookup happens even when metadata has role/company_id.

### Option 2: Fix Crew Member Lookup Logic (Also Needed)

**Change**: When `crew_member_id` is provided in metadata, still look up the crew_member to populate `v_crew_member` for later linking.

**File**: `supabase/migrations/20240320000000_fix_handle_new_user_defensive.sql` (or create new migration)

**Fix**:
```sql
-- 4) Try to match crew_member by email OR by crew_member_id from metadata
-- First, check if crew_member_id is in metadata
DECLARE
  v_metadata_crew_member_id text;
BEGIN
  v_metadata_crew_member_id := NULLIF(NEW.raw_user_meta_data->>'crew_member_id', '');
  
  -- If crew_member_id is in metadata, look it up directly
  IF v_metadata_crew_member_id IS NOT NULL THEN
    BEGIN
      SELECT cm.id, cm.company_id, cm.full_name, cm.role
      INTO v_crew_member
      FROM public.crew_members cm
      WHERE cm.id = v_metadata_crew_member_id::uuid
        AND cm.user_id IS NULL
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      -- Invalid UUID or crew_member not found - continue with email lookup
      v_crew_member := NULL;
    END;
  END IF;
  
  -- If no crew_member found yet, try email lookup (existing logic)
  IF v_crew_member.id IS NULL AND (v_metadata_role IS NULL OR v_company_id IS NULL) AND NEW.email IS NOT NULL THEN
    SELECT cm.id, cm.company_id, cm.full_name, cm.role
    INTO v_crew_member
    FROM public.crew_members cm
    WHERE LOWER(cm.email) = LOWER(NEW.email)
      AND cm.user_id IS NULL
    LIMIT 1;
  END IF;
END;
```

**But this still doesn't solve the "Database error saving new user" issue** - it just fixes the crew_member linking bug.

### Option 3: Skip Profile Insert Entirely in Trigger (Nuclear Option)

**Change**: Remove profile INSERT from trigger entirely, let edge function handle it.

**Risk**: High - breaks existing flow for other user types (customers, admins).

**Not Recommended**: This would break the existing architecture.

---

## Recommended Fix

**The real issue is likely that the exception handler is working (logging warnings), but Supabase Auth is still detecting the error and reporting "Database error saving new user".**

**Smallest Safe Fix**:

### Step 1: Add crew_member_id to Metadata in Edge Function

**File**: `supabase/functions/invite-user/index.ts` (Line 198-208)

**Change**:
```typescript
// Build user metadata with all relevant fields
const userMetadata: Record<string, any> = {
  full_name,
  role: normalizedRole,
  app_next: finalAppNext,
  company_id: callerCompanyId,
};

// Add customer_id to metadata if provided (for customer invites)
if (customer_id) {
  userMetadata.customer_id = customer_id;
}

// Add crew_member_id to metadata if provided (for crew invites)
if (normalizedRole === "crew" && crew_member_id) {
  userMetadata.crew_member_id = crew_member_id;
}
```

### Step 2: Fix Trigger to Look Up Crew Member by crew_member_id from Metadata

**File**: `supabase/migrations/20240320000000_fix_handle_new_user_defensive.sql` (or create new migration)

**Change**: Modify the crew_member lookup logic (Line 49-83) to:
1. First check if `crew_member_id` is in metadata
2. If yes, look it up directly
3. If no, fall back to email lookup (existing logic)

### Step 3: Make Profile INSERT More Defensive

**File**: `supabase/migrations/20240320000000_fix_handle_new_user_defensive.sql` (or create new migration)

**Change**: Add additional validation before profile INSERT to ensure all required data is valid.

**OR**:

**The exception handler may not be catching FK constraint violations properly. Try wrapping the entire trigger function in a top-level exception handler, or make the profile INSERT even more defensive.**

---

## Whether a Migration is Required

**Yes - a migration is required** to fix:
1. The crew_member lookup logic (so crew_member_id from metadata is used)
2. Potentially the profile INSERT exception handling (if it's not catching all errors)

**Migration Name**: `20240321000000_fix_handle_new_user_crew_member_lookup.sql`

---

## Exact Retest Steps

After applying the fix:

1. **CrewAdmin Top Invite Form**:
   - Navigate to Crew/Workers page
   - Fill in: Full Name, Email, Role: "crew"
   - Click "Send Invite"
   - Verify: No "Database error saving new user" error
   - Verify: Crew member row exists
   - Verify: After user accepts invite, `crew_members.user_id` is linked

2. **Check Database Logs**:
   ```sql
   -- Check for warnings in PostgreSQL logs
   -- Should see warnings if profile INSERT fails, but auth user should still be created
   SELECT * FROM pg_stat_statements WHERE query LIKE '%handle_new_user%';
   ```

3. **Verify Profile Creation**:
   ```sql
   -- After invite is sent (before user accepts)
   SELECT id, email, role, company_id FROM profiles WHERE email = 'testworker@example.com';
   -- Should either have profile OR no profile (if exception handler worked)
   
   -- After user accepts invite
   SELECT id, email, role, company_id FROM profiles WHERE email = 'testworker@example.com';
   -- Should have profile now (created by edge function or trigger)
   ```

---

## Summary

**Root Cause**: The `handle_new_user()` trigger's profile INSERT is failing (likely due to FK constraint or RLS), and while the exception handler should catch it, Supabase Auth is still reporting "Database error saving new user". Additionally, the crew_member lookup logic skips looking up crew_member when role/company_id are in metadata, so crew_member never gets linked.

**Exact File**: `supabase/migrations/20240320000000_fix_handle_new_user_defensive.sql` (Function `public.handle_new_user()`, Lines 116-134)

**Smallest Safe Fix**: 
1. Add crew_member_id to metadata in edge function
2. Fix crew_member lookup to use crew_member_id from metadata when present
3. Make profile INSERT even more defensive (skip if any validation fails)

**Migration Required**: Yes - `20240321000000_fix_handle_new_user_crew_member_lookup.sql`

**Risk**: Medium - requires careful testing to ensure exception handler still works and profile creation doesn't break for other user types.
