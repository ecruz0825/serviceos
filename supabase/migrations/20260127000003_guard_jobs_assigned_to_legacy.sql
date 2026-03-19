BEGIN;

-- =============================================================================
-- AB10-P5 Step 1: Database guardrail to prevent writes to jobs.assigned_to
-- - assigned_to is legacy and must not be written by the app going forward
-- - Keep column for backward-compatible reads and audit
-- - Enforce at database level to prevent regressions
-- =============================================================================

-- Step A: Create trigger function to block writes to assigned_to
-- Maintenance bypass: Set app.allow_legacy_assigned_to_write = 'on' to allow writes
-- Example usage:
--   SELECT set_config('app.allow_legacy_assigned_to_write','on', true);
--   -- perform update/insert
--   SELECT set_config('app.allow_legacy_assigned_to_write','off', true);
CREATE OR REPLACE FUNCTION public.block_jobs_assigned_to_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check for maintenance bypass (session setting)
  IF current_setting('app.allow_legacy_assigned_to_write', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- For INSERT: block if assigned_to is not null
  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_to IS NOT NULL THEN
      RAISE EXCEPTION 'assigned_to is legacy and cannot be written. Use assigned_team_id instead. Attempted to insert job with assigned_to = %. To bypass for maintenance, set app.allow_legacy_assigned_to_write = ''on''', NEW.assigned_to;
    END IF;
  END IF;

  -- For UPDATE: block if assigned_to changes
  IF TG_OP = 'UPDATE' THEN
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
      RAISE EXCEPTION 'assigned_to is legacy and cannot be modified. Use assigned_team_id instead. Attempted to change assigned_to from % to %. To bypass for maintenance, set app.allow_legacy_assigned_to_write = ''on''', OLD.assigned_to, NEW.assigned_to;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Step B: Create trigger on jobs table (idempotent)
DROP TRIGGER IF EXISTS block_jobs_assigned_to_write_trigger ON public.jobs;

CREATE TRIGGER block_jobs_assigned_to_write_trigger
  BEFORE INSERT OR UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.block_jobs_assigned_to_write();

-- Step C: Add comment on column noting legacy/deprecated status
COMMENT ON COLUMN public.jobs.assigned_to IS 
  'LEGACY: This column is deprecated and should not be written. Use assigned_team_id for all new assignments. This column is kept for backward-compatible reads and audit purposes only.';

COMMIT;

