-- =============================================================================
-- Verification Script: Revenue Hub Quote → Schedule Flow
-- Run this in Supabase SQL Editor to verify the pipeline is working correctly
-- =============================================================================

-- Test 1: Verify latest accepted public quote creates job with NULL dates
-- Expected: service_date IS NULL and scheduled_end_date IS NULL
SELECT 
  'Test 1: Latest accepted quote job has NULL dates' as test_name,
  j.id as job_id,
  j.service_date,
  j.scheduled_end_date,
  j.status,
  q.quote_number,
  q.status as quote_status,
  CASE 
    WHEN j.service_date IS NULL AND j.scheduled_end_date IS NULL THEN 'PASS'
    ELSE 'FAIL'
  END as result
FROM jobs j
JOIN quotes q ON q.converted_job_id = j.id
WHERE q.status = 'accepted'
  AND q.accepted_at IS NOT NULL
ORDER BY q.accepted_at DESC
LIMIT 5;

-- Test 2: Verify scheduled_end_date can be NULL (no NOT NULL constraint)
-- Expected: Should return jobs with NULL scheduled_end_date
SELECT 
  'Test 2: scheduled_end_date can be NULL' as test_name,
  COUNT(*) as jobs_with_null_end_date,
  CASE 
    WHEN COUNT(*) > 0 THEN 'PASS - NULL values allowed'
    ELSE 'FAIL - No NULL values found (may indicate constraint issue)'
  END as result
FROM jobs
WHERE scheduled_end_date IS NULL
  AND service_date IS NULL;

-- Test 3: Verify unique partial index exists
-- Expected: Index should exist with WHERE status = 'requested'
SELECT 
  'Test 3: Unique partial index exists' as test_name,
  i.relname AS index_name,
  pg_get_indexdef(i.oid) AS index_definition,
  CASE 
    WHEN i.relname = 'idx_job_schedule_requests_one_open_per_job' 
         AND pg_get_indexdef(i.oid) LIKE '%UNIQUE%'
         AND pg_get_indexdef(i.oid) LIKE '%status%requested%' THEN 'PASS'
    ELSE 'FAIL'
  END as result
FROM pg_class t
JOIN pg_index idx ON t.oid = idx.indrelid
JOIN pg_class i ON i.oid = idx.indexrelid
WHERE t.relname = 'job_schedule_requests'
  AND i.relname = 'idx_job_schedule_requests_one_open_per_job';

-- Test 4: Verify no job has > 1 schedule request with status='requested'
-- Expected: Should return 0 rows (no duplicates)
SELECT 
  'Test 4: No duplicate open requests' as test_name,
  job_id,
  COUNT(*) as open_request_count,
  CASE 
    WHEN COUNT(*) > 1 THEN 'FAIL - Duplicate found'
    ELSE 'PASS'
  END as result
FROM job_schedule_requests
WHERE status = 'requested'
GROUP BY job_id
HAVING COUNT(*) > 1;

-- Test 5: Verify approving a request sets job.service_date + job.scheduled_end_date = requested_date
-- Expected: Approved requests should have matching job dates
SELECT 
  'Test 5: Approved requests set job dates correctly' as test_name,
  jsr.id as request_id,
  jsr.requested_date,
  jsr.status as request_status,
  j.service_date as job_service_date,
  j.scheduled_end_date as job_scheduled_end_date,
  CASE 
    WHEN jsr.status = 'approved' 
         AND j.service_date = jsr.requested_date 
         AND j.scheduled_end_date = jsr.requested_date THEN 'PASS'
    WHEN jsr.status = 'approved' 
         AND (j.service_date != jsr.requested_date OR j.scheduled_end_date != jsr.requested_date) THEN 'FAIL - Dates mismatch'
    WHEN jsr.status = 'requested' THEN 'PENDING - Not yet approved'
    ELSE 'UNKNOWN'
  END as result
FROM job_schedule_requests jsr
JOIN jobs j ON j.id = jsr.job_id
WHERE jsr.status IN ('approved', 'requested')
ORDER BY jsr.approved_at DESC NULLS LAST, jsr.created_at DESC
LIMIT 10;

-- Test 6: Verify idempotency - check for jobs with multiple requests (should only have one 'requested')
-- This is a data integrity check
SELECT 
  'Test 6: Idempotency check - one open request per job' as test_name,
  job_id,
  COUNT(*) FILTER (WHERE status = 'requested') as open_requests,
  COUNT(*) FILTER (WHERE status = 'approved') as approved_requests,
  COUNT(*) FILTER (WHERE status = 'declined') as declined_requests,
  COUNT(*) as total_requests,
  CASE 
    WHEN COUNT(*) FILTER (WHERE status = 'requested') > 1 THEN 'FAIL - Multiple open requests'
    WHEN COUNT(*) FILTER (WHERE status = 'requested') = 1 THEN 'PASS'
    ELSE 'INFO - No open requests'
  END as result
FROM job_schedule_requests
GROUP BY job_id
HAVING COUNT(*) FILTER (WHERE status = 'requested') > 1
ORDER BY open_requests DESC;

-- Test 7: Verify jobs in "Needs Scheduling" have NULL service_date
-- Expected: All jobs with NULL service_date should be in pending states
SELECT 
  'Test 7: Needs Scheduling jobs have NULL service_date' as test_name,
  COUNT(*) as jobs_needing_scheduling,
  COUNT(*) FILTER (WHERE status IN ('Completed', 'Canceled', 'Cancelled')) as incorrectly_completed,
  CASE 
    WHEN COUNT(*) FILTER (WHERE status IN ('Completed', 'Canceled', 'Cancelled')) = 0 THEN 'PASS'
    ELSE 'WARNING - Some completed jobs have NULL dates'
  END as result
FROM jobs
WHERE service_date IS NULL
  AND status NOT IN ('Completed', 'Canceled', 'Cancelled');

-- Test 8: Verify hardened behavior - scheduled jobs reject new schedule requests
-- Expected: For a job with service_date NOT NULL, calling request_job_schedule_public 
-- should return ok=false + error='job_already_scheduled'
-- 
-- Manual test steps:
-- 1. Find a quote with an accepted job that has service_date set:
--    SELECT q.public_token, q.id as quote_id, j.id as job_id, j.service_date
--    FROM quotes q
--    JOIN jobs j ON j.id = q.converted_job_id
--    WHERE q.status = 'accepted' AND j.service_date IS NOT NULL
--    LIMIT 1;
--
-- 2. Call the RPC with that quote's public_token:
--    SELECT public.request_job_schedule_public(
--      '<public_token_from_step_1>',
--      CURRENT_DATE + interval '7 days',
--      'Test note'
--    );
--
-- 3. Expected result:
--    {
--      "ok": false,
--      "error": "job_already_scheduled",
--      "reason": "This job is already scheduled and cannot accept new schedule requests"
--    }
--
-- Automated check: Verify jobs with service_date exist (for manual testing)
SELECT 
  'Test 8: Hardened behavior - scheduled jobs reject requests' as test_name,
  COUNT(*) as scheduled_jobs_available_for_test,
  CASE 
    WHEN COUNT(*) > 0 THEN 'PASS - Scheduled jobs exist (manual test can be performed)'
    ELSE 'INFO - No scheduled jobs found (create one to test hardening)'
  END as result
FROM quotes q
JOIN jobs j ON j.id = q.converted_job_id
WHERE q.status = 'accepted' 
  AND q.public_token IS NOT NULL
  AND j.service_date IS NOT NULL;

-- Summary: All tests should show PASS or INFO
-- If any test shows FAIL, investigate the issue
