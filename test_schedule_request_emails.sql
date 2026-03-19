-- =============================================================================
-- Test SQL: Verify Schedule Request Email Notifications
-- Run after applying migration 20260201000001_schedule_request_notifications.sql
-- =============================================================================

-- 1) Check recent quote_messages for schedule request emails
-- This should show emails queued for:
--   - request_job_schedule_public (customer + internal)
--   - approve_job_schedule_request (customer + internal)
--   - decline_job_schedule_request (customer + internal)

SELECT 
  to_email,
  subject,
  status,
  created_at,
  created_by,
  LEFT(body, 100) as body_preview
FROM public.quote_messages
WHERE subject LIKE '%schedule%' OR subject LIKE '%Schedule%'
ORDER BY created_at DESC
LIMIT 20;

-- 2) Count emails by subject pattern
SELECT 
  CASE 
    WHEN subject LIKE '%request received%' THEN 'Request Received'
    WHEN subject LIKE '%confirmed%' THEN 'Schedule Confirmed'
    WHEN subject LIKE '%request update%' THEN 'Request Update'
    WHEN subject LIKE '%New schedule request%' THEN 'Internal: New Request'
    WHEN subject LIKE '%approved%' THEN 'Internal: Approved'
    WHEN subject LIKE '%declined%' THEN 'Internal: Declined'
    ELSE 'Other'
  END as email_type,
  COUNT(*) as count,
  COUNT(CASE WHEN status = 'queued' THEN 1 END) as queued_count,
  COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_count,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count
FROM public.quote_messages
WHERE subject LIKE '%schedule%' OR subject LIKE '%Schedule%'
GROUP BY email_type
ORDER BY count DESC;

-- 3) Verify recent schedule requests and their email status
SELECT 
  jsr.id as request_id,
  jsr.requested_date,
  jsr.status as request_status,
  q.quote_number,
  c.email as customer_email,
  co.support_email as company_support_email,
  (SELECT COUNT(*) 
   FROM public.quote_messages qm 
   WHERE qm.quote_id = q.id 
     AND (qm.subject LIKE '%schedule%' OR qm.subject LIKE '%Schedule%')
     AND qm.created_at >= jsr.created_at
  ) as emails_queued
FROM public.job_schedule_requests jsr
INNER JOIN public.quotes q ON q.id = jsr.quote_id
INNER JOIN public.customers c ON c.id = q.customer_id
INNER JOIN public.companies co ON co.id = jsr.company_id
ORDER BY jsr.created_at DESC
LIMIT 10;

-- 4) Detailed view: Show all emails for a specific schedule request
-- Replace <request_id> with an actual request ID from above query
/*
SELECT 
  qm.id,
  qm.to_email,
  qm.subject,
  qm.status,
  qm.created_at,
  LEFT(qm.body, 200) as body_preview
FROM public.quote_messages qm
INNER JOIN public.job_schedule_requests jsr ON jsr.quote_id = qm.quote_id
WHERE jsr.id = '<request_id>'
  AND (qm.subject LIKE '%schedule%' OR qm.subject LIKE '%Schedule%')
ORDER BY qm.created_at DESC;
*/

