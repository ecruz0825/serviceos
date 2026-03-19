-- =============================================================================
-- Verification Query: Public Quote Acceptance - No Auto-Schedule
-- After accepting a quote via /quote/:token, verify the job has NULL dates
-- and appears in RevenueHub → Needs Scheduling
-- =============================================================================

-- Step 1: Create & send a quote (or use an existing quote with public_token)
-- Step 2: Accept the quote via the public link (/quote/:token)
-- Step 3: Run this query to verify the job was created with NULL dates

SELECT 
  id, 
  service_date, 
  scheduled_end_date, 
  status, 
  invoice_path,
  services_performed,
  job_cost,
  created_at
FROM jobs
ORDER BY id DESC
LIMIT 5;

-- Expected result for the newly created job:
-- - service_date: NULL
-- - scheduled_end_date: NULL
-- - status: 'Pending'
-- - services_performed: 'From Quote [QUOTE_NUMBER]'
-- 
-- This job should appear in RevenueHub → Needs Scheduling because
-- service_date and scheduled_end_date are NULL.

-- Optional: Verify the quote was updated correctly
SELECT 
  id,
  quote_number,
  status,
  accepted_at,
  accepted_by_name,
  customer_comment,
  converted_job_id
FROM quotes
WHERE converted_job_id IS NOT NULL
ORDER BY accepted_at DESC
LIMIT 5;
