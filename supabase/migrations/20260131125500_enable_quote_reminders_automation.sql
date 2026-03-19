BEGIN;

-- =============================================================================
-- Enable automated quote reminders via pg_cron (if available)
-- Falls back gracefully if pg_cron is not available in Supabase
-- Manual trigger button in admin UI serves as fallback
-- =============================================================================

DO $$
DECLARE
  v_cron_available boolean;
  v_job_exists boolean;
BEGIN
  -- Check if pg_cron extension is available
  SELECT EXISTS (
    SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron'
  ) INTO v_cron_available;

  IF v_cron_available THEN
    -- Try to create extension (may require superuser, so use IF NOT EXISTS)
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_cron;
      
      -- Check if job already exists
      SELECT EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'quote_reminders_nightly'
      ) INTO v_job_exists;

      -- Schedule nightly job if it doesn't exist
      IF NOT v_job_exists THEN
        PERFORM cron.schedule(
          'quote_reminders_nightly',
          '0 14 * * *', -- Daily at 14:00 UTC
          'SELECT public.enqueue_quote_reminders(''nightly'');'
        );
        
        RAISE NOTICE 'Scheduled quote reminders nightly job at 14:00 UTC';
      ELSE
        RAISE NOTICE 'Quote reminders nightly job already exists, skipping';
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      -- Extension creation or scheduling failed (likely permissions)
      -- This is OK - manual trigger button in admin UI will serve as fallback
      RAISE NOTICE 'pg_cron not available or insufficient permissions. Manual trigger available in admin UI.';
    END;
  ELSE
    -- pg_cron not available in this Supabase instance
    -- Manual trigger button in admin UI will serve as fallback
    RAISE NOTICE 'pg_cron extension not available. Manual trigger available in admin UI.';
  END IF;
END $$;

COMMIT;

