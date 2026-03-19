BEGIN;

-- =============================================================================
-- Allow NULL service_date and scheduled_end_date for "Needs Scheduling" jobs
-- This enables public quote acceptance to create jobs that land in 
-- RevenueHub → Needs Scheduling instead of being auto-scheduled.
-- =============================================================================

-- 1) Drop NOT NULL constraint on scheduled_end_date
ALTER TABLE public.jobs
  ALTER COLUMN scheduled_end_date DROP NOT NULL;

-- 2) Update trigger function to allow both dates to be NULL
-- Only auto-set scheduled_end_date if service_date is provided
CREATE OR REPLACE FUNCTION public.jobs_set_default_end_date()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only set scheduled_end_date if service_date is NOT NULL
  -- This allows both to be NULL for "Needs Scheduling" jobs
  IF NEW.scheduled_end_date IS NULL AND NEW.service_date IS NOT NULL THEN
    NEW.scheduled_end_date := NEW.service_date;
  END IF;

  -- If service_date changes and end date was not explicitly set, keep them aligned
  -- (This is conservative: only auto-align when end is null and start is not null)
  RETURN NEW;
END;
$$;

-- Note: The CHECK constraint jobs_scheduled_end_date_gte_start already handles NULLs correctly
-- (NULL >= NULL evaluates to NULL, which passes the constraint)

COMMIT;
