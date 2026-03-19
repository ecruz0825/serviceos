BEGIN;

-- =============================================================================
-- CFO Cockpit Phase C10: Case Metrics Foundation
-- =============================================================================
-- Provides metrics RPC for collections case performance tracking.
-- All calculations done in database. No client-side math.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_collections_case_metrics(
  p_as_of timestamptz DEFAULT now()
)
RETURNS TABLE (
  open_cases_count numeric,
  overdue_cases_count numeric,
  closed_last_30d_count numeric,
  avg_days_to_close numeric,
  avg_days_open_current numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_company_id uuid;
  v_role text;
  v_as_of timestamptz;
BEGIN
  -- 1) Require authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- 2) Get company_id and role
  v_company_id := public.current_company_id();
  v_role := public.current_user_role();

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'NO_COMPANY';
  END IF;

  -- 3) Guard: only admin/manager/dispatcher
  IF v_role NOT IN ('admin', 'manager', 'dispatcher') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING
      MESSAGE = 'Only admins, managers, and dispatchers can view collections case metrics';
  END IF;

  -- 4) Use provided as_of or default to now()
  v_as_of := COALESCE(p_as_of, now());

  -- 5) Return metrics as single row
  RETURN QUERY
  SELECT
    -- open_cases_count: count where status in ('open','in_progress')
    COALESCE(COUNT(*) FILTER (WHERE cc.status IN ('open', 'in_progress')), 0)::numeric AS open_cases_count,
    
    -- overdue_cases_count: count where status <> 'closed' and due_at is not null and due_at < p_as_of
    COALESCE(COUNT(*) FILTER (
      WHERE cc.status <> 'closed'
        AND cc.due_at IS NOT NULL
        AND cc.due_at < v_as_of
    ), 0)::numeric AS overdue_cases_count,
    
    -- closed_last_30d_count: count where status='closed' and closed_at >= p_as_of - interval '30 days'
    COALESCE(COUNT(*) FILTER (
      WHERE cc.status = 'closed'
        AND cc.closed_at IS NOT NULL
        AND cc.closed_at >= (v_as_of - interval '30 days')
    ), 0)::numeric AS closed_last_30d_count,
    
    -- avg_days_to_close: average of (closed_at - created_at) in days for closed cases
    COALESCE(
      AVG(
        EXTRACT(epoch FROM (cc.closed_at - cc.created_at)) / 86400.0
      ) FILTER (WHERE cc.status = 'closed' AND cc.closed_at IS NOT NULL AND cc.created_at IS NOT NULL),
      0
    )::numeric AS avg_days_to_close,
    
    -- avg_days_open_current: average of (p_as_of - created_at) in days for open/in_progress cases
    COALESCE(
      AVG(
        EXTRACT(epoch FROM (v_as_of - cc.created_at)) / 86400.0
      ) FILTER (WHERE cc.status IN ('open', 'in_progress') AND cc.created_at IS NOT NULL),
      0
    )::numeric AS avg_days_open_current
  FROM public.collections_cases cc
  WHERE cc.company_id = v_company_id;
END;
$$;

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION public.get_collections_case_metrics(timestamptz) TO authenticated;

COMMIT;
