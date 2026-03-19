# CFO Cockpit Testing Notes

## SQL Editor Testing (Why AUTH_REQUIRED Errors Occur)

When testing CFO RPCs in the Supabase SQL Editor, you may encounter `AUTH_REQUIRED` errors because:

- The SQL Editor runs queries in a context where `auth.uid()` returns `NULL`
- All CFO RPCs require authentication: `IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'`
- This is by design for security - RPCs should only be called from authenticated application sessions

## Local Verification (Impersonation Method)

To test CFO RPCs in SQL Editor for local development, you can temporarily impersonate a user:

### Step 1: Find a valid user ID

```sql
-- Get a real user ID from profiles (admin/manager/dispatcher role)
SELECT id, role, company_id
FROM public.profiles
WHERE role IN ('admin', 'manager', 'dispatcher')
LIMIT 1;
```

### Step 2: Set session context (impersonation)

```sql
-- Replace '<user-id-here>' with an actual user ID from Step 1
-- This sets the auth context for the current session
SELECT set_config('request.jwt.claim.sub', '<user-id-here>', true);
```

**Note:** This method only works in local development. In production/Supabase hosted, use the authenticated app session.

### Step 3: Test RPCs

```sql
-- Test Collections Queue
SELECT * FROM public.get_collections_queue_for_company(25, now());

-- Test CFO Trends
SELECT * FROM public.get_cfo_trends_for_company(6) ORDER BY period_start;

-- Test AR Aging
SELECT * FROM public.get_ar_aging_for_company(now());

-- Test Cash Forecast
SELECT * FROM public.get_cash_forecast_for_company(now(), 30);

-- Test Financial Snapshot
SELECT * FROM public.get_financial_snapshot_for_company(30, 14);
```

## Recommended Testing Approach

**Best Practice:** Test CFO RPCs through the application UI rather than SQL Editor:

1. **As Admin/Manager/Dispatcher:**
   - Navigate to `/admin/revenue-hub`
   - All CFO sections should load without errors
   - Check browser console for any warnings/errors

2. **As Crew/Customer:**
   - Navigate to `/admin/revenue-hub`
   - CFO sections should be hidden (no errors)
   - RPCs should return `FORBIDDEN` if called directly

## Security Notes

- All CFO RPCs enforce:
  - Authentication required (`auth.uid() IS NOT NULL`)
  - Company isolation (`company_id = current_company_id()`)
  - Role restrictions (`role IN ('admin','manager','dispatcher')`)
- Never bypass these checks in production
- The impersonation method above is for **local development only**
