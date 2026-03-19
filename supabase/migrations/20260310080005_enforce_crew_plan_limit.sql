-- =============================================================================
-- Crew Plan Limit Enforcement (Phase 3A - Plan Engine)
-- =============================================================================
-- Enforces crew plan limits at the database level using a BEFORE INSERT
-- trigger on public.crew_members.
--
-- Trigger Function: enforce_crew_plan_limit
-- - Checks company's plan limits and current usage
-- - Blocks insert if crew limit is reached
-- - Allows insert if limit is NULL (unlimited) or not yet reached
--
-- Trigger: trg_enforce_crew_plan_limit
-- - Fires BEFORE INSERT on public.crew_members
-- - Uses SECURITY DEFINER to access plan_limits table
-- =============================================================================

BEGIN;

-- =============================================================================
-- Trigger Function: enforce_crew_plan_limit
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enforce_crew_plan_limit()
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

  -- If max_crew IS NULL, allow insert (unlimited)
  IF v_usage.max_crew IS NULL THEN
    RETURN NEW;
  END IF;

  -- If current_crew >= max_crew, raise exception
  IF v_usage.current_crew >= v_usage.max_crew THEN
    RAISE EXCEPTION 'CREW_LIMIT_REACHED' USING
      MESSAGE = format(
        'CREW_LIMIT_REACHED: %s plan allows up to %s crew members. Upgrade to Pro to add more crew members.',
        v_usage.plan_code,
        v_usage.max_crew
      );
  END IF;

  -- Otherwise allow insert
  RETURN NEW;
END;
$$;

-- =============================================================================
-- Create Trigger
-- =============================================================================

DROP TRIGGER IF EXISTS trg_enforce_crew_plan_limit ON public.crew_members;

CREATE TRIGGER trg_enforce_crew_plan_limit
  BEFORE INSERT ON public.crew_members
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_crew_plan_limit();

COMMIT;
