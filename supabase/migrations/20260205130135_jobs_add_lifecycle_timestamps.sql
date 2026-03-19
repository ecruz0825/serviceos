BEGIN;

-- =============================================================================
-- Add Lifecycle Timestamps to Jobs Table
-- Adds created_at, updated_at, and completed_at columns with automatic triggers
-- =============================================================================

-- 1) Add columns if they don't exist
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- 2) Backfill existing rows
-- Set created_at/updated_at to now() where null (safety check, though DEFAULT should handle this)
UPDATE public.jobs
SET created_at = COALESCE(created_at, now()),
    updated_at = COALESCE(updated_at, now())
WHERE created_at IS NULL OR updated_at IS NULL;

-- Set completed_at for jobs that are already completed but don't have completed_at set
UPDATE public.jobs
SET completed_at = now()
WHERE completed_at IS NULL
  AND status IS NOT NULL
  AND LOWER(TRIM(status)) IN ('completed', 'complete', 'done');

-- 3) Create trigger function for jobs lifecycle management
CREATE OR REPLACE FUNCTION public.jobs_lifecycle_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_old_status text;
  v_new_status text;
  v_old_completed boolean;
  v_new_completed boolean;
BEGIN
  -- Always update updated_at on any update
  NEW.updated_at = now();

  -- Get old and new status (normalized, case-insensitive)
  v_old_status := COALESCE(LOWER(TRIM(OLD.status)), '');
  v_new_status := COALESCE(LOWER(TRIM(NEW.status)), '');
  
  -- Determine if status indicates completed
  v_old_completed := v_old_status IN ('completed', 'complete', 'done') OR OLD.completed_at IS NOT NULL;
  v_new_completed := v_new_status IN ('completed', 'complete', 'done');

  -- Handle completed_at based on status transitions
  IF v_new_completed AND NOT v_old_completed THEN
    -- Transitioning INTO completed state: set completed_at
    IF NEW.completed_at IS NULL THEN
      NEW.completed_at = now();
    END IF;
  ELSIF NOT v_new_completed AND v_old_completed THEN
    -- Transitioning OUT OF completed state: clear completed_at
    NEW.completed_at = NULL;
  END IF;
  -- If already completed and staying completed, keep existing completed_at (don't overwrite)

  RETURN NEW;
END;
$$;

-- 4) Drop existing trigger if it exists (for idempotency)
DROP TRIGGER IF EXISTS jobs_lifecycle_trigger ON public.jobs;

-- 5) Create trigger
CREATE TRIGGER jobs_lifecycle_trigger
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.jobs_lifecycle_trigger();

COMMIT;
