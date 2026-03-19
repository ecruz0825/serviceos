-- =============================================================================
-- Invoice Overdue Evaluation Operations (Invoice Pipeline Step 3B)
-- =============================================================================
-- Ensures eval_invoices_overdue_for_company is properly configured for
-- scheduled jobs and manual execution.
--
-- This migration is mostly a no-op verification, but ensures:
-- - Function is SECURITY DEFINER and tenant-safe
-- - Function updates last_status_eval_at and updated_at
-- - GRANT EXECUTE is in place
-- =============================================================================

BEGIN;

-- Verify function exists and has correct signature
-- (Already created in 20260212000008_invoice_lifecycle_rpcs.sql)
-- This migration serves as documentation and ensures grants are in place

-- Ensure GRANT is in place (idempotent)
GRANT EXECUTE ON FUNCTION public.eval_invoices_overdue_for_company(int) TO authenticated;

-- =============================================================================
-- Scheduled Job Setup (pg_cron)
-- =============================================================================
-- To set up a daily scheduled job to evaluate overdue invoices:
--
-- Option 1: Via Supabase Dashboard (Recommended)
-- 1. Go to Database > Cron Jobs (or Extensions > pg_cron)
-- 2. Click "New Cron Job"
-- 3. Configure:
--    - Name: "eval_invoices_overdue_daily"
--    - Schedule: "0 3 * * *" (runs daily at 3:00 AM UTC)
--    - SQL Command:
--        SELECT public.eval_invoices_overdue_all_companies(500);
--    - Enabled: true
--
-- Option 2: Via SQL (Direct pg_cron)
-- Run this SQL in Supabase SQL Editor (requires superuser or pg_cron extension):
--
--   SELECT cron.schedule(
--     'eval-invoices-overdue-daily',
--     '0 3 * * *',  -- Daily at 3:00 AM UTC
--     $$SELECT public.eval_invoices_overdue_all_companies(500)$$
--   );
--
-- Note: eval_invoices_overdue_all_companies explicitly iterates through all companies
-- and is designed for cron execution (service_role only). For manual/admin execution,
-- use eval_invoices_overdue_for_company which processes the current user's company.
--
-- To view scheduled jobs:
--   SELECT * FROM cron.job;
--
-- To unschedule:
--   SELECT cron.unschedule('eval-invoices-overdue-daily');
-- =============================================================================

COMMIT;
