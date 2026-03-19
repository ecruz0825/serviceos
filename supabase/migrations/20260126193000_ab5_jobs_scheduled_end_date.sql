-- AB5: Multi-day job spans (date-based)
-- Add scheduled_end_date with backfill + trigger defaulting to service_date
-- Enforce end >= start and not null.

BEGIN;

-- 1) Add column if missing (nullable for now)
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS scheduled_end_date date;

-- 2) Backfill existing rows (use service_date as the start date)
UPDATE public.jobs
SET scheduled_end_date = service_date
WHERE scheduled_end_date IS NULL;

-- 3) Add constraint end >= start (idempotent via DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'jobs_scheduled_end_date_gte_start'
      AND conrelid = 'public.jobs'::regclass
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_scheduled_end_date_gte_start
      CHECK (scheduled_end_date >= service_date);
  END IF;
END $$;

-- 4) Trigger function: ensure scheduled_end_date is set when omitted
CREATE OR REPLACE FUNCTION public.jobs_set_default_end_date()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.scheduled_end_date IS NULL THEN
    NEW.scheduled_end_date := NEW.service_date;
  END IF;

  -- If service_date changes and end date was not explicitly set, keep them aligned
  -- (This is conservative: only auto-align when end is null; UI can explicitly set spans.)
  RETURN NEW;
END;
$$;

-- 5) Trigger (drop/recreate to keep idempotent)
DROP TRIGGER IF EXISTS trg_jobs_set_default_end_date ON public.jobs;

CREATE TRIGGER trg_jobs_set_default_end_date
BEFORE INSERT OR UPDATE ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.jobs_set_default_end_date();

-- 6) Now enforce NOT NULL (safe after backfill + trigger)
ALTER TABLE public.jobs
  ALTER COLUMN scheduled_end_date SET NOT NULL;

COMMIT;

