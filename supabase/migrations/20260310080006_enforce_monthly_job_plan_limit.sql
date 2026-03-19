-- =============================================================================
-- Monthly Job Plan Limit Enforcement (Phase 3A - Plan Engine)
-- =============================================================================
-- Enforces monthly job plan limits at the database level using a BEFORE INSERT
-- trigger on public.jobs.
--
-- Trigger Function: enforce_monthly_job_plan_limit
-- - Checks company's plan limits and current monthly usage
-- - Blocks insert if monthly job limit is reached
-- - Allows insert if limit is NULL (unlimited) or not yet reached
--
-- Trigger: trg_enforce_monthly_job_plan_limit
-- - Fires BEFORE INSERT on public.jobs
-- - Uses SECURITY DEFINER to access plan_limits table
-- =============================================================================

BEGIN;

-- =============================================================================
-- Trigger Function: enforce_monthly_job_plan_limit
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enforce_monthly_job_plan_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_usage record;
BEGIN
  -- Get company's plan limits and current usage
  SELECT * INTO v_usage
  FROM public.get_company_plan_usage(NEW.company_id);

  -- If no company row returned, raise exception
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMPANY_NOT_FOUND' USING
      MESSAGE = format('Company %s not found', NEW.company_id);
  END IF;

  -- If max_jobs_per_month IS NULL, allow insert (unlimited)
  IF v_usage.max_jobs_per_month IS NULL THEN
    RETURN NEW;
  END IF;

  -- If current_jobs_this_month >= max_jobs_per_month, raise exception
  IF v_usage.current_jobs_this_month >= v_usage.max_jobs_per_month THEN
    RAISE EXCEPTION 'JOB_LIMIT_REACHED' USING
      MESSAGE = format(
        'JOB_LIMIT_REACHED: %s plan allows up to %s jobs per month. Upgrade to Pro to create more jobs.',
        v_usage.plan_code,
        v_usage.max_jobs_per_month
      );
  END IF;

  -- Otherwise allow insert
  RETURN NEW;
END;
$$;

-- =============================================================================
-- Create Trigger
-- =============================================================================

DROP TRIGGER IF EXISTS trg_enforce_monthly_job_plan_limit ON public.jobs;

CREATE TRIGGER trg_enforce_monthly_job_plan_limit
  BEFORE INSERT ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_monthly_job_plan_limit();

COMMIT;
