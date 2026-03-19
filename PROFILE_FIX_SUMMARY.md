# Profile Lookup Fix Summary

## Problem
The `received_by` field in the `payments` table was being saved correctly, but the UI was showing "—" or "Received By: -" everywhere because profile lookups were failing due to:
1. Missing RLS policies on the `profiles` table
2. No automatic profile creation trigger on `auth.users` insert
3. Potential RLS blocking profile reads

## Fixes Applied

### 1. Database Migration: `20260126000002_profiles_setup_and_rls.sql`

**Created:**
- `current_company_id()` helper function (if it didn't exist)
- Automatic profile creation trigger on `auth.users` insert
- RLS policies for `profiles` table:
  - `profiles_select_same_company`: Users can SELECT profiles in their same company
  - `profiles_select_admin_all_company`: Admins can SELECT all profiles in their company
  - `profiles_select_own`: Users can always SELECT their own profile
  - `profiles_update_own`: Users can UPDATE their own profile
- Foreign key constraint: `payments.received_by` → `profiles.id` (for future nested selects)

**Key Features:**
- Idempotent: Safe to run multiple times
- Tenant-safe: All policies enforce `company_id` matching
- Auto-creates profiles: Trigger ensures every `auth.users` insert creates a corresponding `profiles` row

### 2. UI Updates

**Files Modified:**
- `src/pages/admin/PaymentsAdmin.jsx`
- `src/pages/admin/JobsAdmin.jsx`
- `src/CustomerDashboard.jsx`
- `src/pages/customer/CustomerPortal.jsx`

**Changes:**
- Enhanced UUID collection logic to handle edge cases (nested objects, string conversion)
- Added comprehensive console logging for debugging:
  - Number of `received_by` UUIDs collected
  - Number of profiles fetched
  - Built `profilesById` map contents
  - Missing profile warnings
- Improved error handling with detailed error logging
- All UI components now correctly display `received_by_name` from the lookup map

### 3. Profile Lookup Pattern

All components follow this pattern:
1. Collect unique `received_by` UUIDs from payment records
2. Filter out nulls and ensure valid UUID strings
3. Batch fetch profiles using `.in('id', uuidList)`
4. Build `profilesById` lookup map: `{ [uuid]: full_name }`
5. Decorate payment records with `received_by_name`
6. Display `received_by_name` in UI (fallback to "—" if missing)

## Test Checklist

### Prerequisites
1. **Apply the migration:**
   ```bash
   # If using Supabase CLI locally:
   supabase db reset
   # OR apply the migration manually in Supabase Dashboard
   ```

2. **Verify profile creation:**
   - Check that all existing users have a row in `public.profiles`
   - Verify `profiles.id = auth.users.id` for all users
   - Verify `profiles.company_id` is set correctly

### Test 1: PaymentsAdmin Table
**Steps:**
1. Log in as an admin user
2. Navigate to Admin Dashboard → Payments
3. Verify the "Received By" column shows staff member names (not "—")
4. Check browser console for logs:
   - `[PaymentsAdmin] Fetching profiles for received_by UUIDs: X [array]`
   - `[PaymentsAdmin] Fetched profiles: X [array]`
   - `[PaymentsAdmin] Built profilesById map with X entries: {object}`

**Expected Result:**
- All payments show staff member names in "Received By" column
- Console shows successful profile fetches
- No "Missing profile" warnings in console

### Test 2: JobsAdmin Invoice PDF
**Steps:**
1. Log in as an admin user
2. Navigate to Admin Dashboard → Jobs
3. Find a job with payments
4. Click "Invoice" → "PDF" to generate invoice
5. Open the PDF and check payment lines
6. Verify each payment line shows "Received By: [Name]" (not "Received By: -")

**Expected Result:**
- Invoice PDF payment lines include "Received By: [Staff Name]"
- Console shows successful profile fetches in JobsAdmin

### Test 3: CustomerDashboard Payment History
**Steps:**
1. Log in as an admin user
2. Navigate to Customer Dashboard
3. Select a customer with payment history
4. Open the jobs modal
5. Check payment history for a job
6. Verify payment entries show "Received by: [Name]" (not "Received by: -")

**Expected Result:**
- Payment history shows "Received by: [Staff Name]" for each payment
- Console shows successful profile fetches

### Test 4: CustomerPortal Payment History
**Steps:**
1. Log in as a customer user
2. Navigate to Customer Portal
3. Scroll to payment history section
4. Verify payment entries show "Received by: [Name]" (not "Received by: -")

**Expected Result:**
- Payment history shows "Received by: [Staff Name]" for each payment
- Console shows successful profile fetches

### Test 5: New Payment Creation
**Steps:**
1. Create a new payment via CustomerDashboard or CrewPortal
2. Verify the payment is saved with `received_by` set to the current user's UUID
3. Refresh the page and verify the "Received By" name appears correctly

**Expected Result:**
- New payments correctly save `received_by`
- Names appear immediately after refresh

### Test 6: RLS Policy Verification
**Steps:**
1. Log in as a customer user
2. Open browser console
3. Try to query profiles:
   ```javascript
   const { data, error } = await supabase
     .from('profiles')
     .select('id, full_name')
     .in('id', ['some-uuid-from-same-company'])
   ```
4. Verify you can only see profiles from your company
5. Try querying a profile from a different company - should return empty

**Expected Result:**
- Customer can only see profiles from their own company
- Cross-company profile access is blocked

### Test 7: Profile Auto-Creation
**Steps:**
1. Create a new user via the invite-user function or signup
2. Check `public.profiles` table
3. Verify a profile row was automatically created with `id = auth.users.id`

**Expected Result:**
- New users automatically get a profile row
- Profile `id` matches `auth.users.id`

## Debugging

If names still don't appear:

1. **Check RLS policies:**
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'profiles';
   ```

2. **Verify profile exists:**
   ```sql
   SELECT id, full_name, company_id FROM profiles WHERE id = '<received_by_uuid>';
   ```

3. **Check console logs:**
   - Look for `[ComponentName] Fetching profiles...` logs
   - Check if `receivedByIds` array contains valid UUIDs
   - Verify `profilesData` is not empty
   - Check if `profilesById` map has entries

4. **Test RLS directly:**
   ```sql
   -- As the authenticated user, try:
   SELECT id, full_name FROM profiles WHERE id IN ('<uuid1>', '<uuid2>');
   ```

5. **Verify company_id matching:**
   - Ensure `payments.company_id` matches `profiles.company_id`
   - Check that `current_company_id()` returns the correct value

## Files Changed

### Migrations
- `supabase/migrations/20260126000002_profiles_setup_and_rls.sql` (NEW)

### React Components
- `src/pages/admin/PaymentsAdmin.jsx`
- `src/pages/admin/JobsAdmin.jsx`
- `src/CustomerDashboard.jsx`
- `src/pages/customer/CustomerPortal.jsx`

## Notes

- The migration is idempotent and safe to run multiple times
- Profile creation trigger only creates basic profile (email, full_name from metadata)
- Company assignment happens via the `invite-user` function or manual update
- RLS policies ensure tenant isolation - users can only see profiles from their company
- Console logs are temporary and can be removed after verification

