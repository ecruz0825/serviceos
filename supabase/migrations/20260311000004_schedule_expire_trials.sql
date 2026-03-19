-- =============================================================================
-- Schedule Trial Expiration Daily Job
-- =============================================================================
-- Schedules public.expire_trials() to run automatically once per day using pg_cron.
-- Falls back gracefully if pg_cron is not available in Supabase.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_cron_available boolean;
  v_job_exists boolean;
  v_job_id bigint;
BEGIN
  -- Check if pg_cron extension is available
  SELECT EXISTS (
    SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron'
  ) INTO v_cron_available;

  IF v_cron_available THEN
    -- Try to create extension (may require superuser, so use IF NOT EXISTS)
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_cron;
      
      -- Check if job already exists by jobname
      SELECT EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'serviceops-expire-trials-daily'
      ) INTO v_job_exists;

      -- Unschedule existing job if it exists (for idempotency)
      IF v_job_exists THEN
        -- Get job ID for unschedule
        SELECT jobid INTO v_job_id
        FROM cron.job
        WHERE jobname = 'serviceops-expire-trials-daily'
        LIMIT 1;
        
        IF v_job_id IS NOT NULL THEN
          PERFORM cron.unschedule(v_job_id);
          RAISE NOTICE 'Unscheduled existing trial expiration job (jobid: %)', v_job_id;
        END IF;
      END IF;

      -- Schedule daily job at 02:00 UTC (early morning, low traffic)
      PERFORM cron.schedule(
        'serviceops-expire-trials-daily',
        '0 2 * * *', -- Daily at 02:00 UTC
        'SELECT public.expire_trials();'
      );
      
      RAISE NOTICE 'Scheduled trial expiration daily job at 02:00 UTC';
      
    EXCEPTION WHEN OTHERS THEN
      -- Extension creation or scheduling failed (likely permissions)
      -- This is OK - function can still be called manually if needed
      RAISE NOTICE 'pg_cron not available or insufficient permissions. Function public.expire_trials() can be called manually.';
    END;
  ELSE
    -- pg_cron not available in this Supabase instance
    -- Function can still be called manually if needed
    RAISE NOTICE 'pg_cron extension not available. Function public.expire_trials() can be called manually.';
  END IF;
END $$;

COMMIT;
