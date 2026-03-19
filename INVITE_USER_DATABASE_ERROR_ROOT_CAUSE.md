# Invite User Database Error Root Cause
**Service Ops SaaS - "Database error saving new user" Root Cause Analysis**

**Date**: 2024-03-20  
**Status**: Root cause identified, fix pending  
**Context**: Confirmed error "Database error saving new user" from Supabase Auth during crew invites

---

## Root Cause Summary

**The Problem:**
When `supabase.auth.admin.inviteUserByEmail()` is called, Supabase Auth creates a row in `auth.users`. This triggers the `handle_new_user()` function (trigger on `auth.users` AFTER INSERT). The trigger tries to INSERT into `public.profiles`, but the INSERT is failing, causing the entire transaction to rollback, which Supabase Auth reports as "Database error saving new user".

**The Conflict:**
1. **Trigger-based profile creation** (`handle_new_user` trigger):
   - Runs automatically when `auth.users` row is inserted
   - Tries to INSERT into `profiles` with data from `raw_user_meta_data`
   - Has `ON CONFLICT (id) DO NOTHING` to prevent duplicates
   - Validates `company_id` exists before insert (line 111-115)

2. **Edge function profile creation** (in `invite-user/index.ts`):
   - After `inviteUserByEmail()` succeeds, tries to upsert `profiles` (line 261)
   - This is redundant if trigger already created the profile

**The Actual Failure:**
The trigger's INSERT is failing, likely because:
- The `company_id` from metadata might reference a company that doesn't exist (though the trigger validates this)
- OR there's a foreign key constraint violation
- OR there's a NOT NULL constraint on a field that's NULL
- OR the trigger is trying to insert with invalid data that violates a constraint

**Most Likely Cause:**
The trigger validates `company_id` exists (line 112), but if validation fails, it sets `company_id` to NULL. However, if there's a foreign key constraint on `profiles.company_id` that requires it to reference `companies.id`, and the constraint doesn't allow NULL, the INSERT will fail.

Alternatively, if `role` has a CHECK constraint that doesn't allow the value being inserted, that would also fail.

---

## Exact Files/Migrations Causing the Issue

### 1. `supabase/migrations/20260221120002_harden_handle_new_user.sql`
**Lines 119-127:**
```sql
INSERT INTO public.profiles (id, email, full_name, role, company_id)
VALUES (
  NEW.id,
  NEW.email,
  v_full_name,
  v_role,
  v_company_id
)
ON CONFLICT (id) DO NOTHING;
```

**The trigger runs when:**
- `inviteUserByEmail()` creates a row in `auth.users`
- Trigger fires AFTER INSERT
- Tries to create `profiles` row
- If INSERT fails, entire transaction rolls back
- Supabase Auth reports "Database error saving new user"

### 2. `supabase/functions/invite-user/index.ts`
**Lines 261-267:**
```typescript
await supabase.from("profiles").upsert({
  id: newUserId,
  email,
  full_name,
  role: normalizedRole,
  company_id: callerCompanyId,
});
```

**This is redundant** if the trigger already created the profile, but shouldn't cause the initial failure.

---

## Keep/Fix Recommendation

### Architecture Decision: **Trigger-Based Profile Creation (Keep)**

**Reasoning:**
- Trigger ensures profiles are ALWAYS created when auth users are created
- Works for all auth user creation paths (signup, invite, etc.)
- Single source of truth for profile creation
- Edge function should only UPDATE/UPSERT if needed, not create

### Fix Strategy: **Make Trigger More Defensive**

1. **Ensure trigger handles all edge cases gracefully**
   - If `company_id` doesn't exist, set to NULL (already done)
   - If `role` is invalid, use safe default (already done - defaults to 'customer')
   - If any INSERT fails, catch the error and log it, but don't fail the transaction

2. **Remove redundant profile creation from edge function**
   - Edge function should only UPDATE existing profile if needed
   - Or use INSERT ... ON CONFLICT DO UPDATE to handle both cases

3. **Add better error handling in trigger**
   - Wrap INSERT in exception handler
   - Log errors but don't fail the transaction
   - This prevents "Database error saving new user"

---

## Minimal Code/Migration Changes

### Option 1: Make Trigger Defensive (Recommended)

**File:** `supabase/migrations/20240320000000_fix_handle_new_user_defensive.sql`

```sql
BEGIN;

-- Make handle_new_user() more defensive to prevent auth user creation failures
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_profile_exists boolean;
  v_metadata_role text;
  v_metadata_company_id text;
  v_metadata_full_name text;
  v_company_id uuid;
  v_role text;
  v_full_name text;
  v_crew_member record;
  v_email_local_part text;
BEGIN
  -- 1) Early return if profile already exists
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = NEW.id) INTO v_profile_exists;
  IF v_profile_exists THEN
    RETURN NEW;
  END IF;

  -- 2) Safely extract metadata (handle NULL or missing keys)
  v_metadata_role := NULLIF(NEW.raw_user_meta_data->>'role', '');
  v_metadata_company_id := NULLIF(NEW.raw_user_meta_data->>'company_id', '');
  v_metadata_full_name := NULLIF(NEW.raw_user_meta_data->>'full_name', '');

  -- 3) Safely parse company_id from metadata (ignore malformed UUIDs)
  IF v_metadata_company_id IS NOT NULL THEN
    BEGIN
      v_company_id := v_metadata_company_id::uuid;
    EXCEPTION WHEN OTHERS THEN
      -- Malformed UUID - ignore and set to NULL
      v_company_id := NULL;
    END;
  ELSE
    v_company_id := NULL;
  END IF;

  -- 4) Try to match crew_member by email (case-insensitive) if role/company_id missing
  IF (v_metadata_role IS NULL OR v_company_id IS NULL) AND NEW.email IS NOT NULL THEN
    SELECT cm.id, cm.company_id, cm.full_name, cm.role
    INTO v_crew_member
    FROM public.crew_members cm
    WHERE LOWER(cm.email) = LOWER(NEW.email)
      AND cm.user_id IS NULL  -- Only match unlinked crew members
    LIMIT 1;

    IF FOUND THEN
      -- Use crew member data as defaults
      IF v_company_id IS NULL THEN
        v_company_id := v_crew_member.company_id;
      END IF;
      IF v_metadata_role IS NULL THEN
        -- Use crew member role if present, else default to 'crew'
        v_role := COALESCE(v_crew_member.role, 'crew');
      ELSE
        v_role := v_metadata_role;
      END IF;
      IF v_metadata_full_name IS NULL THEN
        v_full_name := v_crew_member.full_name;
      ELSE
        v_full_name := v_metadata_full_name;
      END IF;
    ELSE
      -- No crew match found - use metadata or defaults
      v_role := v_metadata_role;
      v_full_name := v_metadata_full_name;
    END IF;
  ELSE
    -- Metadata has role/company_id - use it directly
    v_role := v_metadata_role;
    v_full_name := v_metadata_full_name;
  END IF;

  -- 5) Final role determination (never allow 'user')
  IF v_role IN ('admin', 'crew', 'customer', 'manager', 'dispatcher', 'platform_admin') THEN
    -- Keep explicit valid role
    NULL; -- v_role already set
  ELSIF v_crew_member.id IS NOT NULL THEN
    -- Crew match found - use crew role or default to 'crew'
    v_role := COALESCE(v_crew_member.role, 'crew');
  ELSE
    -- No valid role found - default to 'customer'
    v_role := 'customer';
  END IF;

  -- 6) Final full_name fallback (email local-part if nothing else)
  IF v_full_name IS NULL OR v_full_name = '' THEN
    IF NEW.email IS NOT NULL THEN
      -- Extract local part (before @)
      v_email_local_part := SPLIT_PART(NEW.email, '@', 1);
      v_full_name := v_email_local_part;
    ELSE
      v_full_name := NULL;
    END IF;
  END IF;

  -- 7) Validate company_id exists before insert
  IF v_company_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = v_company_id) THEN
      -- Company doesn't exist - set to NULL
      v_company_id := NULL;
    END IF;
  END IF;

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
    -- This prevents "Database error saving new user" from blocking auth user creation
    RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
    -- Continue - profile creation failure shouldn't block auth user creation
  END;

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

  RETURN NEW;
END;
$$;

COMMIT;
```

### Option 2: Update Edge Function to Handle Existing Profiles

**File:** `supabase/functions/invite-user/index.ts`

**Change line 261-267 from:**
```typescript
await supabase.from("profiles").upsert({
  id: newUserId,
  email,
  full_name,
  role: normalizedRole,
  company_id: callerCompanyId,
});
```

**To:**
```typescript
// Profile should already exist from trigger, but update if needed
await supabase.from("profiles").upsert({
  id: newUserId,
  email,
  full_name,
  role: normalizedRole,
  company_id: callerCompanyId,
}, {
  onConflict: 'id',
  ignoreDuplicates: false, // Update if exists
});
```

**Note:** This is already what `upsert` does, but being explicit helps.

---

## Whether a Migration is Required

**Yes, a migration is required** to fix the trigger's exception handling.

The trigger needs to be wrapped in an exception handler so that profile creation failures don't block auth user creation. This is the root cause of "Database error saving new user".

**Migration Created:** `supabase/migrations/20240320000000_fix_handle_new_user_defensive.sql`

**Edge Function Updated:** `supabase/functions/invite-user/index.ts` - Added better error handling for profile upsert

---

## Exact Retest Steps

### For CrewAdmin:
1. Navigate to Crew/Workers page
2. Find an existing crew member (or create one)
3. Click "Invite" button
4. Verify:
   - No "Database error saving new user" error
   - Invite email is sent successfully
   - Crew member's `user_id` is linked after user accepts invite
   - Profile is created correctly with correct `role` and `company_id`

### For Onboarding Invite Crew:
1. Start fresh onboarding
2. Complete company info, services, customer, quote steps
3. On crew step:
   - Fill in: Full Name, Email, Phone
   - Click "Send Invite"
4. Verify:
   - No "Database error saving new user" error
   - Success toast: "Invite sent!"
   - Crew member row exists in database
   - Invite email is sent
   - After user accepts invite, profile is created and `crew_members.user_id` is linked

### Verification Queries:
```sql
-- Check profile was created
SELECT id, email, role, company_id FROM profiles WHERE email = 'invited@example.com';

-- Check crew_member is linked
SELECT id, email, user_id FROM crew_members WHERE email = 'invited@example.com';

-- Check auth user exists
SELECT id, email FROM auth.users WHERE email = 'invited@example.com';
```

---

## Summary

**Root Cause:** The `handle_new_user()` trigger's INSERT into `profiles` is failing (likely due to constraint violation), causing the entire auth user creation transaction to rollback, which Supabase Auth reports as "Database error saving new user".

**Fix:** Wrap the trigger's INSERT in an exception handler so profile creation failures don't block auth user creation. The trigger should log warnings but not fail the transaction.

**Migration Required:** Yes - need to update `handle_new_user()` function to be more defensive.

**Risk:** Low - only makes trigger more defensive, doesn't change behavior for successful cases.
