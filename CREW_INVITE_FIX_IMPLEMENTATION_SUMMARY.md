# Crew Invite Fix Implementation Summary
**Service Ops SaaS - Fix for "Database error saving new user"**

**Date**: 2024-03-21  
**Status**: Implementation Complete  
**Context**: Fixed crew invite auth creation failure by adding crew_member_id to metadata and updating trigger to use it for deterministic crew_member linking.

---

## Files Changed

### 1. `supabase/functions/invite-user/index.ts`
**Change**: Added `crew_member_id` to user metadata for crew invites

**Lines Modified**: 198-215
- Added `crew_member_id` to metadata when `normalizedRole === "crew" && crew_member_id` is present
- This allows the trigger to look up the exact crew_members row instead of relying on email fallback

**Before**:
```typescript
const userMetadata: Record<string, any> = {
  full_name,
  role: normalizedRole,
  app_next: finalAppNext,
  company_id: callerCompanyId,
};

if (customer_id) {
  userMetadata.customer_id = customer_id;
}
```

**After**:
```typescript
const userMetadata: Record<string, any> = {
  full_name,
  role: normalizedRole,
  app_next: finalAppNext,
  company_id: callerCompanyId,
};

if (customer_id) {
  userMetadata.customer_id = customer_id;
}

// Add crew_member_id to metadata if provided (for crew invites)
if (normalizedRole === "crew" && crew_member_id) {
  userMetadata.crew_member_id = crew_member_id;
}
```

### 2. `supabase/migrations/20260321000000_fix_handle_new_user_crew_member_lookup.sql`
**Change**: New migration that updates `handle_new_user()` to use `crew_member_id` from metadata

**Key Changes**:
1. **Extract `crew_member_id` from metadata** (Line 35)
2. **Prioritize crew_member_id lookup** (Lines 48-70)
   - If `crew_member_id` is in metadata, look it up directly
   - Validate crew_member belongs to same company_id
   - Fall back to email lookup only if crew_member_id lookup fails or is absent
3. **Preserve defensive behavior** (Lines 118-134, 136-147)
   - Profile INSERT wrapped in exception handler
   - Crew member linking wrapped in exception handler
   - Both log warnings, not hard failures

**Logic Flow**:
1. Extract `crew_member_id` from metadata
2. If present, look up crew_member by ID directly
3. Validate company_id match (if both present)
4. If crew_member_id lookup fails or absent, fall back to email lookup (existing logic)
5. Use crew_member data for profile defaults
6. Insert profile (defensive - wrapped in exception handler)
7. Link crew_member.user_id (defensive - wrapped in exception handler)

---

## Migration Required

**Yes - migration must be applied**

**Migration File**: `supabase/migrations/20260321000000_fix_handle_new_user_crew_member_lookup.sql`

**Migration Type**: Function replacement (CREATE OR REPLACE FUNCTION)

**Breaking Changes**: None - preserves existing behavior for customer/admin/platform_admin flows

---

## Exact Deploy Commands

### Option 1: Supabase CLI (Recommended)
```bash
# Apply migration
supabase db push

# Or apply specific migration
supabase migration up
```

### Option 2: Supabase Dashboard
1. Navigate to Database → Migrations
2. Upload `supabase/migrations/20260321000000_fix_handle_new_user_crew_member_lookup.sql`
3. Apply migration

### Option 3: Direct SQL (Production)
```bash
# Connect to Supabase database
psql $DATABASE_URL

# Run migration
\i supabase/migrations/20260321000000_fix_handle_new_user_crew_member_lookup.sql
```

### Edge Function Deploy
```bash
# Deploy updated invite-user edge function
supabase functions deploy invite-user
```

---

## Exact Retest Steps

### Test 1: CrewAdmin Top Invite Form

**Steps**:
1. Navigate to `/admin/crew` (Crew/Workers page)
2. Fill in the top "Invite Internal Staff" form:
   - Full Name: "Test Worker"
   - Email: "testworker@example.com"
   - Role: "crew"
3. Click "Send Invite"

**Expected Results**:
- ✅ No "Database error saving new user" error
- ✅ Success toast: "Staff invite sent!"
- ✅ Crew member row is created (check database or refresh page)
- ✅ Invite email is sent to testworker@example.com
- ✅ After user accepts invite and signs in:
  - `auth.users` row exists for testworker@example.com
  - `profiles` row exists with `id = auth.users.id`, `role = 'crew'`, `company_id` set
  - `crew_members.user_id` is linked to `auth.users.id`

**Verification Queries**:
```sql
-- Check crew_member was created
SELECT id, email, user_id, company_id, full_name 
FROM crew_members 
WHERE email = 'testworker@example.com';

-- Check profile was created (after user accepts invite)
SELECT id, email, role, company_id, full_name 
FROM profiles 
WHERE email = 'testworker@example.com';

-- Check auth user exists (after user accepts invite)
SELECT id, email, raw_user_meta_data 
FROM auth.users 
WHERE email = 'testworker@example.com';

-- Verify linkage (after user accepts invite)
SELECT 
  cm.id as crew_member_id,
  cm.email as crew_email,
  cm.user_id,
  p.id as profile_id,
  p.role as profile_role,
  p.company_id
FROM crew_members cm
LEFT JOIN profiles p ON p.id = cm.user_id
WHERE cm.email = 'testworker@example.com';
```

---

### Test 2: Onboarding Invite Crew Step

**Steps**:
1. Start fresh onboarding (new company or reset existing)
2. Complete steps:
   - Company info
   - Services
   - Customer
   - Quote
3. On "Invite Crew" step:
   - Full Name: "Onboarding Worker"
   - Email: "onboarding@example.com"
   - Phone: (optional)
4. Click "Send Invite"

**Expected Results**:
- ✅ No "Database error saving new user" error
- ✅ Success toast: "Invite sent!"
- ✅ Crew member row is created
- ✅ Invite email is sent
- ✅ After user accepts invite:
  - `crew_members.user_id` is linked correctly
  - Profile is created with correct role and company_id

**Verification Queries**:
```sql
-- Same queries as Test 1, but with email = 'onboarding@example.com'
```

---

### Test 3: Existing Row Invite Button

**Steps**:
1. Navigate to `/admin/crew` (Crew/Workers page)
2. Find an existing crew member row (or create one via "Add Worker" form)
3. Click "Invite" button on the row

**Expected Results**:
- ✅ No "Database error saving new user" error
- ✅ Success toast: "Invite email sent!"
- ✅ Invite email is sent to the crew member's email
- ✅ After user accepts invite:
  - `crew_members.user_id` is linked to the existing crew_member row
  - Profile is created with correct role and company_id

**Verification Queries**:
```sql
-- Check existing crew_member before invite
SELECT id, email, user_id, company_id 
FROM crew_members 
WHERE id = '<crew_member_id_from_row>';

-- After user accepts invite, verify linkage
SELECT 
  cm.id,
  cm.email,
  cm.user_id,
  p.id as profile_id,
  p.role
FROM crew_members cm
LEFT JOIN profiles p ON p.id = cm.user_id
WHERE cm.id = '<crew_member_id_from_row>';
```

---

## Additional Verification

### Check Edge Function Logs
```bash
# View invite-user function logs
supabase functions logs invite-user

# Look for:
# - "crewMemberIdInMetadata: true" in log output
# - No "Database error saving new user" errors
# - Successful invite responses
```

### Check Database Warnings
```sql
-- Check PostgreSQL logs for warnings from handle_new_user()
-- Should see warnings if profile INSERT or crew_member linking fails
-- But auth user creation should still succeed
SELECT * FROM pg_stat_statements 
WHERE query LIKE '%handle_new_user%';
```

### Verify Metadata in Auth Users
```sql
-- After invite is sent (before user accepts)
-- Check that crew_member_id is in metadata
SELECT 
  id,
  email,
  raw_user_meta_data->>'crew_member_id' as crew_member_id_from_metadata,
  raw_user_meta_data->>'role' as role_from_metadata,
  raw_user_meta_data->>'company_id' as company_id_from_metadata
FROM auth.users
WHERE email = 'testworker@example.com';
```

---

## Risk Assessment

**Risk Level**: Low

**Why Low Risk**:
- ✅ Preserves existing behavior for customer/admin/platform_admin flows
- ✅ Adds defensive exception handling (doesn't remove any)
- ✅ Only changes crew invite flow (adds crew_member_id lookup)
- ✅ Falls back to email lookup if crew_member_id lookup fails
- ✅ Validates company_id match for tenant safety
- ✅ No breaking changes to existing functionality

**Potential Issues**:
- If crew_member_id in metadata is invalid, falls back to email lookup (safe)
- If crew_member_id points to wrong company, validation catches it (safe)
- If profile INSERT fails, exception handler logs warning but doesn't block auth (safe)

---

## Summary

**Root Cause Fixed**: 
- Edge function now includes `crew_member_id` in metadata for crew invites
- Trigger now looks up crew_member by `crew_member_id` from metadata (deterministic)
- Falls back to email lookup if crew_member_id is absent or invalid
- Preserves defensive behavior and tenant safety

**Files Changed**: 2 files
1. `supabase/functions/invite-user/index.ts` (add crew_member_id to metadata)
2. `supabase/migrations/20260321000000_fix_handle_new_user_crew_member_lookup.sql` (new migration)

**Migration Required**: Yes

**Deploy Commands**: 
- `supabase db push` (or apply migration via dashboard)
- `supabase functions deploy invite-user`

**Expected Outcome**: Crew invites should now succeed without "Database error saving new user", and crew_members.user_id should be linked deterministically after user accepts invite.
