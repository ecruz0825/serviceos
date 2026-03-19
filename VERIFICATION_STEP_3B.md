# Step 3B Hardening Verification Runbook

## ✅ Implementation Status

### 1) UI Role Visibility

**Code Location:** `src/pages/admin/RevenueHub.jsx`

**Implementation:**
- ✅ `userRole` state is fetched from profile: `.select('company_id, role')`
- ✅ Button condition: `{userRole && ['admin', 'manager', 'dispatcher'].includes(userRole) && (`
- ✅ Button only renders for admin/manager/dispatcher roles

**Manual Test Steps:**
1. Login as admin → Navigate to `/admin/revenue` → Button should be visible
2. Login as crew/customer → Navigate to `/admin/revenue` → Button should NOT be visible

**Server-Side Enforcement:**
- Function `eval_invoices_overdue_for_company` enforces role check server-side
- Even if button was visible, unauthorized users would get FORBIDDEN error

---

### 2) RPC Permission Checks

**Function Permissions:**

**`eval_invoices_overdue_for_company(int)`:**
- ✅ `GRANT EXECUTE ON FUNCTION ... TO authenticated;`
- ✅ Role check: `IF v_role NOT IN ('admin', 'manager', 'dispatcher') THEN RAISE EXCEPTION 'FORBIDDEN'`
- ✅ **Expected:** Authenticated admin can execute

**`eval_invoices_overdue_all_companies(int)`:**
- ✅ `GRANT EXECUTE ON FUNCTION ... TO service_role;`
- ✅ **Expected:** Authenticated users get permission denied
- ✅ **Expected:** Service role (cron) can execute

**Test SQL (Run in Supabase SQL Editor):**

```sql
-- Test 1: As authenticated admin (should succeed)
SELECT public.eval_invoices_overdue_for_company(10);
-- ✅ Expected: Returns updated_count

-- Test 2: As authenticated admin (should fail)
SELECT public.eval_invoices_overdue_all_companies(10);
-- ✅ Expected: ERROR: permission denied for function eval_invoices_overdue_all_companies
```

---

### 3) Cron Function Correctness (Multi-Tenant)

**Function:** `eval_invoices_overdue_all_companies(int)`

**Implementation Verified:**
- ✅ Explicitly iterates: `FOR v_company_record IN SELECT DISTINCT id FROM public.companies`
- ✅ Processes each company: `WHERE company_id = v_company_record.id`
- ✅ Updates: `status='overdue'`, `last_status_eval_at=now()`, `updated_at=now()`
- ✅ Conditions: `status NOT IN ('paid', 'void')`, `due_date < now()`, `balance_due > 0`
- ✅ Accumulates total: `v_total_updated := v_total_updated + COALESCE(v_company_updated, 0)`
- ✅ Returns total count across all companies

**Test SQL (Run as service_role or via cron):**

```sql
-- Step 1: Create test data for 2 companies
UPDATE invoices
SET due_date = now() - interval '1 day',
    balance_due = 10,
    status = 'sent'
WHERE company_id = '<companyA>' 
  AND status NOT IN ('paid','void')
LIMIT 1;

UPDATE invoices
SET due_date = now() - interval '1 day',
    balance_due = 10,
    status = 'sent'
WHERE company_id = '<companyB>' 
  AND status NOT IN ('paid','void')
LIMIT 1;

-- Step 2: Run multi-tenant function (service_role context)
SELECT public.eval_invoices_overdue_all_companies(500);
-- Expected: Returns updated_count >= 2

-- Step 3: Verify both companies updated
SELECT company_id, COUNT(*) as overdue_count
FROM invoices
WHERE status = 'overdue'
  AND company_id IN ('<companyA>', '<companyB>')
GROUP BY company_id;
-- Expected: Both companies show overdue_count >= 1
```

---

### 4) Cron Schedule Command

**Updated Documentation:** `supabase/migrations/20260212000009_invoice_overdue_eval_ops.sql`

**Cron Job Configuration:**

**Via Supabase Dashboard:**
1. Go to Database > Cron Jobs
2. Click "New Cron Job"
3. Configure:
   - **Name:** `eval_invoices_overdue_daily`
   - **Schedule:** `0 3 * * *` (daily at 3:00 AM UTC)
   - **SQL Command:**
     ```sql
     SELECT public.eval_invoices_overdue_all_companies(500);
     ```
   - **Enabled:** `true`

**Via SQL (Direct pg_cron):**
```sql
SELECT cron.schedule(
  'eval-invoices-overdue-daily',
  '0 3 * * *',  -- Daily at 3:00 AM UTC
  $$SELECT public.eval_invoices_overdue_all_companies(500)$$
);
```

**Verify Scheduled Job:**
```sql
SELECT * FROM cron.job WHERE jobname = 'eval-invoices-overdue-daily';
```

---

## Summary

✅ **UI Role Visibility:** Button only visible to admin/manager/dispatcher  
✅ **RPC Permissions:** Correct separation (authenticated vs service_role)  
✅ **Multi-Tenant Cron:** Explicitly iterates through all companies  
✅ **Documentation:** Updated with correct function name  

**All implementation verified and ready for testing.**
