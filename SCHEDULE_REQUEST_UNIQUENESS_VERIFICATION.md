# Schedule Request Uniqueness Enforcement - Verification Guide

**Migration File:** `supabase/migrations/20260206000002_enforce_one_open_schedule_request_per_job.sql`

---

## A) Database Enforcement

### 1. Unique Index Verification

**SQL to verify the unique index exists:**
```sql
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'job_schedule_requests'
  AND indexname = 'idx_job_schedule_requests_one_open_per_job';
```

**Expected Result:**
- `indexname`: `idx_job_schedule_requests_one_open_per_job`
- `indexdef`: Should contain `UNIQUE` and `WHERE status = 'requested'`

**Alternative check:**
```sql
SELECT 
  i.relname AS index_name,
  pg_get_indexdef(i.oid) AS index_definition
FROM pg_class t
JOIN pg_index idx ON t.oid = idx.indrelid
JOIN pg_class i ON i.oid = idx.indexrelid
WHERE t.relname = 'job_schedule_requests'
  AND i.relname = 'idx_job_schedule_requests_one_open_per_job';
```

---

### 2. Duplicate Prevention Test

**SQL to confirm duplicates are prevented:**
```sql
-- Test 1: Try to insert duplicate (should fail)
-- First, create a valid request
INSERT INTO job_schedule_requests (
  company_id, job_id, quote_id, public_token, requested_date, status
)
SELECT 
  company_id,
  converted_job_id,
  id,
  gen_random_uuid(),
  CURRENT_DATE + interval '7 days',
  'requested'
FROM quotes
WHERE status = 'accepted'
  AND converted_job_id IS NOT NULL
LIMIT 1
RETURNING id, job_id, status;

-- Test 2: Try to insert another request for the same job (should fail with unique violation)
-- Replace <job_id> with the job_id from Test 1
INSERT INTO job_schedule_requests (
  company_id, job_id, quote_id, public_token, requested_date, status
)
SELECT 
  company_id,
  '<job_id>',  -- Same job_id as Test 1
  id,
  gen_random_uuid(),
  CURRENT_DATE + interval '14 days',  -- Different date
  'requested'
FROM quotes
WHERE status = 'accepted'
  AND converted_job_id = '<job_id>'
LIMIT 1;
-- Expected: ERROR: duplicate key value violates unique constraint "idx_job_schedule_requests_one_open_per_job"
```

**Alternative: Check existing data for violations:**
```sql
-- This should return 0 rows (no duplicates)
SELECT 
  job_id,
  COUNT(*) as open_request_count
FROM job_schedule_requests
WHERE status = 'requested'
GROUP BY job_id
HAVING COUNT(*) > 1;
```

---

### 3. RPC Function Verification

**Test the RPC with existing request:**
```sql
-- Step 1: Get a quote token and job_id
SELECT 
  q.public_token,
  q.converted_job_id,
  q.id as quote_id
FROM quotes q
WHERE q.status = 'accepted'
  AND q.converted_job_id IS NOT NULL
LIMIT 1;

-- Step 2: Create a request manually (or via RPC first call)
-- Use the public_token from Step 1
SELECT public.request_job_schedule_public(
  '<public_token>',
  CURRENT_DATE + interval '7 days',
  'Test note'
);

-- Step 3: Call RPC again with same token (should return already_exists = true)
SELECT public.request_job_schedule_public(
  '<public_token>',
  CURRENT_DATE + interval '14 days',  -- Different date
  'Different note'
);
-- Expected: { ok: true, already_exists: true, request_id: <same_id>, ... }
```

---

## B) Frontend Verification

### 1. Check Existing Request on Load

**RPC to check request status:**
```sql
-- Test the helper RPC
SELECT public.get_schedule_request_status_public('<quote_public_token>');
-- Expected: { ok: true, has_request: true/false, ... }
```

---

## C) Manual UI Test Checklist

### Test 1: Accept Quote → Job Created (service_date NULL)

**Steps:**
1. Create a quote and send it via email
2. Open public quote link (`/quote/:token`)
3. Accept the quote
4. Verify job is created

**Expected:**
- Job appears in RevenueHub → "Needs Scheduling"
- Job has `service_date = NULL` in database
- Quote status = 'accepted'
- Quote has `converted_job_id` set

**SQL Verification:**
```sql
SELECT 
  j.id,
  j.service_date,
  j.status,
  q.status as quote_status,
  q.converted_job_id
FROM jobs j
JOIN quotes q ON q.converted_job_id = j.id
WHERE q.public_token = '<your_token>'
  AND q.status = 'accepted';
```

---

### Test 2: Submit Schedule Request

**Steps:**
1. After accepting quote, navigate to `/schedule/:token` (or click "Request a Schedule Date" from receipt)
2. Select a date and optionally add a note
3. Click "Submit Request"
4. Verify success message appears

**Expected:**
- Success toast: "Schedule request submitted"
- Form shows "Request Received" state
- Request appears in `job_schedule_requests` table with `status = 'requested'`

**SQL Verification:**
```sql
SELECT 
  jsr.id,
  jsr.job_id,
  jsr.requested_date,
  jsr.customer_note,
  jsr.status,
  jsr.created_at
FROM job_schedule_requests jsr
JOIN quotes q ON q.converted_job_id = jsr.job_id
WHERE q.public_token = '<your_token>'
  AND jsr.status = 'requested';
```

---

### Test 3: Refresh Page and Attempt Submit Again → Should NOT Create New Row

**Steps:**
1. With a request already submitted (from Test 2)
2. Refresh the schedule request page (`/schedule/:token`)
3. Verify the page shows "Request Received" state immediately (no form)
4. If form is visible, try to submit again with a different date
5. Verify no new row is created

**Expected:**
- Page loads showing "Request Received" state (checks on load via `get_schedule_request_status_public`)
- If form submission is attempted, toast shows: "Request already received — we'll confirm soon."
- RPC returns: `{ ok: true, already_exists: true, request_id: <existing_id> }`
- Only ONE row exists in `job_schedule_requests` with `status = 'requested'` for this job

**SQL Verification:**
```sql
-- Should return exactly 1 row
SELECT COUNT(*) as open_request_count
FROM job_schedule_requests
WHERE job_id = '<your_job_id>'
  AND status = 'requested';
-- Expected: 1
```

**Attempt Duplicate Insert (should fail):**
```sql
-- This should fail with unique constraint violation
INSERT INTO job_schedule_requests (
  company_id, job_id, quote_id, public_token, requested_date, status
)
SELECT 
  company_id,
  '<your_job_id>',
  id,
  gen_random_uuid(),
  CURRENT_DATE + interval '30 days',
  'requested'
FROM quotes
WHERE converted_job_id = '<your_job_id>'
LIMIT 1;
-- Expected: ERROR: duplicate key value violates unique constraint
```

---

### Test 4: Admin Approves Request → Job.service_date Set, Request Status Becomes Approved

**Steps:**
1. With a pending schedule request (from Test 2)
2. Go to Schedule Requests Admin (`/admin/schedule-requests`)
3. Find the request and click "Approve"
4. Verify request status changes
5. Verify job's `service_date` is set
6. Return to RevenueHub → "Needs Scheduling"
7. Verify job is no longer in the queue

**Expected:**
- Request status changes from `'requested'` to `'approved'`
- Job's `service_date` is set to the requested date
- Job's `scheduled_end_date` is also set to the requested date
- Job disappears from "Needs Scheduling" queue
- Job appears in "Scheduled" stage

**SQL Verification:**
```sql
-- Before approval
SELECT 
  jsr.id,
  jsr.status as request_status,
  jsr.requested_date,
  j.service_date as job_service_date,
  j.scheduled_end_date
FROM job_schedule_requests jsr
JOIN jobs j ON j.id = jsr.job_id
WHERE jsr.id = '<request_id>';

-- After approval
-- Should show: request_status = 'approved', job_service_date = requested_date
```

---

### Test 5: After Approval, Customer Can Submit New Request (Optional Behavior)

**Current Implementation:**
- After approval, the request status is `'approved'` (not `'requested'`)
- The unique index only applies to `status = 'requested'`
- Therefore, a new request CAN be created after approval

**Expected Behavior:**
- If a job's schedule request is approved, the job gets `service_date` set
- The job moves out of "Needs Scheduling"
- If the job's `service_date` is later cleared (manually), a new request can be submitted
- The unique index only prevents multiple OPEN requests, not historical requests

**SQL Verification:**
```sql
-- Check if multiple approved requests can exist (they can)
SELECT 
  job_id,
  status,
  COUNT(*) as count
FROM job_schedule_requests
WHERE job_id = '<your_job_id>'
GROUP BY job_id, status;
-- Expected: Can have multiple rows with different statuses, but only 1 with status = 'requested'
```

**If you want to prevent new requests after approval:**
- This would require additional logic in the RPC to check if the job already has `service_date` set
- Current implementation allows re-requesting if needed (e.g., if admin clears the date)

---

## Summary

**Migration File:** `supabase/migrations/20260206000002_enforce_one_open_schedule_request_per_job.sql`

**Key Changes:**
1. ✅ Partial unique index: `UNIQUE (job_id) WHERE status = 'requested'`
2. ✅ RPC updated to check for existing requests and return idempotent response
3. ✅ Helper RPC `get_schedule_request_status_public()` for frontend checks
4. ✅ Frontend checks for existing requests on page load
5. ✅ Frontend handles `already_exists = true` response gracefully

**Build Status:** ✅ Passes (`npm run build` successful)

**Files Modified:**
- `supabase/migrations/20260206000002_enforce_one_open_schedule_request_per_job.sql` (new)
- `src/pages/public/PublicJobScheduleRequest.jsx` (updated)
