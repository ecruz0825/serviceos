-- =============================================================================
-- Route Order Persistence (Scheduling Workflow)
-- =============================================================================
-- 1) Adds jobs.route_order (if missing)
-- 2) Adds schedule-oriented index for route ordering lookups
-- 3) Adds RPC to apply optimized route order to jobs for a service date
-- =============================================================================

BEGIN;

-- =============================================================================
-- Part 1: jobs.route_order column + index
-- =============================================================================

ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS route_order integer;

CREATE INDEX IF NOT EXISTS idx_jobs_company_service_date_route_order
  ON public.jobs (company_id, service_date, route_order);

-- =============================================================================
-- Part 2: apply_optimized_route_for_day RPC
-- =============================================================================

CREATE OR REPLACE FUNCTION public.apply_optimized_route_for_day(
  p_service_date date
)
RETURNS TABLE (
  updated_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_role text;
  v_updated_count integer := 0;
BEGIN
  -- 1) Require authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- 2) Resolve caller profile
  SELECT p.company_id, p.role
  INTO v_company_id, v_role
  FROM public.profiles p
  WHERE p.id = v_user_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'NO_COMPANY';
  END IF;

  -- 3) Role gate
  IF v_role NOT IN ('admin', 'manager', 'dispatcher') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING
      MESSAGE = 'Only admins, managers, and dispatchers can apply optimized routes';
  END IF;

  -- 4) Validate input
  IF p_service_date IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING
      MESSAGE = 'p_service_date is required';
  END IF;

  -- 5) Apply optimized route order for caller company + selected date
  WITH optimized AS (
    SELECT *
    FROM public.get_optimized_route_for_day(p_service_date)
  ),
  updated AS (
    UPDATE public.jobs j
    SET route_order = o.route_order
    FROM optimized o
    WHERE j.id = o.job_id
      AND j.company_id = v_company_id
      AND j.service_date = p_service_date
      AND COALESCE(j.status, '') NOT IN ('Canceled')
    RETURNING j.id
  )
  SELECT COUNT(*)::integer
  INTO v_updated_count
  FROM updated;

  RETURN QUERY
  SELECT v_updated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_optimized_route_for_day(date) TO authenticated;

COMMIT;
