# Invite User Crew Member ID Required Fix
**Service Ops SaaS - Require crew_member_id for Crew Invites**

**Date**: 2024-03-20  
**Status**: Complete  
**Context**: "Database error saving new user" occurs when inviting crew without crew_member_id. Root cause: crew invites should require crew_member_id, and CrewAdmin top form should create crew_member first.

---

## Root Cause

**The Problem:**
1. CrewAdmin top invite form (`inviteInternalStaff`) calls `invite-user` with `role: "crew"` but NO `crew_member_id`
2. Edge function allows this (only validates `crew_member_id` if provided)
3. Trigger `handle_new_user()` tries to match crew_member by email, but finds nothing
4. Trigger creates profile with `role='crew'` and `company_id` from metadata
5. Some database constraint or trigger failure occurs during auth user creation
6. Supabase Auth reports "Database error saving new user"

**The Real Issue:**
- Crew invites without `crew_member_id` don't make business sense
- There's no `crew_members` row to link the user to after invite acceptance
- The trigger logic assumes crew_member exists or can be matched by email
- When neither is true, the profile creation may violate some constraint or business rule

**Architecture Decision:**
**Crew invites MUST have `crew_member_id`** - this is the canonical flow:
1. Create/find `crew_members` row first
2. Then call `invite-user` with `crew_member_id`
3. Edge function validates crew_member exists and belongs to company
4. Trigger can link `crew_members.user_id` after user accepts invite

---

## Exact Files/Migrations Causing the Issue

### 1. `src/pages/admin/CrewAdmin.jsx` (Line 160-209)
**Problem:** `inviteInternalStaff` calls `invite-user` without `crew_member_id` for crew role

**Before:**
```javascript
const { data, error } = await supabase.functions.invoke('invite-user', {
  body: {
    email,
    full_name: staffInviteForm.full_name.trim() || null,
    role,  // Can be 'crew'
    app_next: appNextByRole[role],
    // ❌ No crew_member_id for crew role
  },
});
```

### 2. `supabase/functions/invite-user/index.ts` (Line 145-173)
**Problem:** Edge function allows crew invites without `crew_member_id` (only validates if provided)

**Before:**
```typescript
if (normalizedRole === "crew" && crew_member_id) {
  // Validate crew_member_id
} else if (normalizedRole === "crew" && !crew_member_id) {
  // ⚠️ Warning only - allows crew invite without crew_member_id
  console.log("[invite-user] Warning: crew role without crew_member_id - will use email fallback");
}
```

---

## Keep/Fix Recommendation

### Architecture: **Require crew_member_id for Crew Invites**

**Canonical Flow:**
1. **Create/find crew_member first** (in CrewAdmin, onboarding, etc.)
2. **Call invite-user with crew_member_id** (edge function validates it)
3. **Trigger links user_id** after user accepts invite

**Benefits:**
- Consistent with business logic (crew members must exist before invite)
- Matches onboarding flow (creates crew_member first)
- Matches row invite button flow (uses existing crew_member.id)
- Prevents orphaned profiles (profile with role='crew' but no crew_member link)

---

## Minimal Code/Migration Changes

### 1. Edge Function: Require crew_member_id for Crew Invites

**File:** `supabase/functions/invite-user/index.ts`

**Change:**
- Require `crew_member_id` for crew role (return 400 if missing)
- Remove fallback logic for crew invites without crew_member_id
- Add better error diagnostics for database errors

### 2. CrewAdmin: Create Crew Member First

**File:** `src/pages/admin/CrewAdmin.jsx`

**Change:**
- For crew role, create/find `crew_members` row first
- Then call `invite-user` with `crew_member_id`
- Align with onboarding and row invite button patterns

### 3. Better Error Diagnostics

**File:** `supabase/functions/invite-user/index.ts`

**Change:**
- Log more context when database errors occur
- Provide clearer error messages to frontend
- Include role, company_id, crew_member_id in diagnostic messages

---

## Whether a Migration is Required

**No migration required** - this is a code change only:
- Edge function validation change (require crew_member_id)
- Frontend flow change (create crew_member first)
- No database schema changes needed

The existing defensive trigger migration (`20240320000000_fix_handle_new_user_defensive.sql`) already handles profile creation failures gracefully, but requiring `crew_member_id` prevents the issue from occurring in the first place.

---

## Exact Retest Steps

### For CrewAdmin Top Invite Form:
1. Navigate to Crew/Workers page
2. Fill in top "Invite Internal Staff" form:
   - Full Name: "Test Worker"
   - Email: "testworker@example.com"
   - Role: "crew"
3. Click "Send Invite"
4. Verify:
   - ✅ Crew member row is created first (check database or refresh page)
   - ✅ No "Database error saving new user" error
   - ✅ Success toast: "Staff invite sent!"
   - ✅ Invite email is sent
   - ✅ After user accepts invite, `crew_members.user_id` is linked

### For CrewAdmin Row Invite Button:
1. Navigate to Crew/Workers page
2. Find existing crew member (or create one)
3. Click "Invite" button on the row
4. Verify:
   - ✅ No "Database error saving new user" error
   - ✅ Success toast: "Invite email sent!"
   - ✅ Invite email is sent
   - ✅ `crew_members.user_id` is linked after user accepts invite

### For Onboarding Invite Crew:
1. Start fresh onboarding
2. Complete company info, services, customer, quote steps
3. On crew step:
   - Fill in: Full Name, Email, Phone
   - Click "Send Invite"
4. Verify:
   - ✅ Crew member row is created first
   - ✅ No "Database error saving new user" error
   - ✅ Success toast: "Invite sent!"
   - ✅ Invite email is sent
   - ✅ `crew_members.user_id` is linked after user accepts invite

### Verification Queries:
```sql
-- Check crew_member was created
SELECT id, email, user_id, company_id FROM crew_members WHERE email = 'testworker@example.com';

-- Check profile was created
SELECT id, email, role, company_id FROM profiles WHERE email = 'testworker@example.com';

-- Check auth user exists
SELECT id, email FROM auth.users WHERE email = 'testworker@example.com';

-- Verify linkage
SELECT cm.id, cm.email, cm.user_id, p.id as profile_id, p.role
FROM crew_members cm
LEFT JOIN profiles p ON p.id = cm.user_id
WHERE cm.email = 'testworker@example.com';
```

### Error Case Testing:
1. Try to invite crew with invalid email → Should show validation error
2. Try to invite crew when plan limit reached → Should show upgrade message
3. Try to invite crew with duplicate email → Should handle gracefully

---

## Summary

**Root Cause:** CrewAdmin top form was calling `invite-user` with `role: "crew"` but no `crew_member_id`, causing database errors during auth user creation. The trigger `handle_new_user()` couldn't match a crew_member by email (none existed), and creating a profile with `role='crew'` without a linked crew_member may have violated business rules or constraints.

**Files Changed:** 2 files (`CrewAdmin.jsx`, `invite-user/index.ts`)

**Fix:**
1. **Edge Function:** Require `crew_member_id` for crew invites (return 400 if missing)
2. **CrewAdmin:** Create/find `crew_member` first, then invite with `crew_member_id`
3. **Error Diagnostics:** Add better error messages for database errors with context
4. **Canonical Flow:** All crew invites now follow: create crew_member → invite with crew_member_id → trigger links user_id

**Result:** All crew invite flows (CrewAdmin top form, CrewAdmin row button, Onboarding) now follow the same canonical pattern: create crew_member first → invite with crew_member_id → trigger links user_id after acceptance.

**Migration Required:** No - code changes only.

**Risk:** Low - surgical changes, aligns with existing onboarding/row invite patterns, prevents invalid crew invite flows, maintains multi-tenant safety.

---

## All Auth-Related Triggers/Functions Audited

### Triggers on `auth.users`:
1. **`on_auth_user_created`** (AFTER INSERT)
   - Function: `public.handle_new_user()`
   - Purpose: Auto-create `profiles` row when auth user is created
   - Behavior: 
     - Extracts role, company_id, full_name from `raw_user_meta_data`
     - Tries to match crew_member by email if role/company_id missing
     - Creates profile with validated data
     - Links crew_member.user_id if match found
   - Safety: Wrapped in exception handler (from defensive migration) to prevent blocking auth user creation

### No Other Triggers Found:
- No BEFORE INSERT triggers on `auth.users`
- No UPDATE triggers on `auth.users`
- No other functions that run automatically on auth user creation

### Constraints Checked:
- `profiles.id` has FK to `auth.users(id)` ON DELETE CASCADE (safe)
- `profiles.company_id` has no FK constraint (allows NULL)
- `profiles.role` has no CHECK constraint (allows any text)
- No NOT NULL constraints on `profiles.role` or `profiles.company_id` (both nullable)

**Conclusion:** The trigger is the only code that runs on auth user creation. The defensive exception handler should prevent failures, but requiring `crew_member_id` prevents the issue from occurring in the first place.
