BEGIN;

-- =============================================================================
-- CFO Cockpit Phase C10-A: SLA Discipline (Days Overdue + SLA Breach Rate)
-- =============================================================================
-- Adds days_overdue visibility in Cases queue + SLA breach rate metric (executive KPI).
-- DB-first. NO drift. No client math.
-- =============================================================================

-- =============================================================================
-- Update RPC 1: get_collections_cases_for_company
-- =============================================================================
-- Add days_overdue and sla_breached derived columns.
-- Update ordering to prioritize SLA breaches.
-- =============================================================================

-- Drop first so we can change RETURNS TABLE signature safely
DROP FUNCTION IF EXISTS public.get_collections_cases_for_company(text, uuid, int, int);

CREATE FUNCTION public.get_collections_cases_for_company(
  p_status text DEFAULT NULL,
  p_assigned_to uuid DEFAULT NULL,
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  customer_id uuid,
  status text,
  priority text,
  assigned_to uuid,
  due_at timestamptz,
  next_action text,
  created_at timestamptz,
  updated_at timestamptz,
  closed_at timestamptz,
  customer_name text,
  customer_email text,
  is_overdue boolean,
  is_due_soon boolean,
  days_overdue integer,
  sla_breached boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_company_id uuid;
  v_role text;
  v_limit int;
  v_offset int;
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
      MESSAGE = 'Only admins, managers, and dispatchers can view collections cases';
  END IF;

  -- 4) Parameter validation and clamping
  v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 100), 500));
  v_offset := GREATEST(0, COALESCE(p_offset, 0));

  -- 5) Return filtered and ordered cases with SLA discipline fields
  RETURN QUERY
  SELECT
    cc.id,
    cc.customer_id,
    cc.status,
    cc.priority,
    cc.assigned_to,
    cc.due_at,
    cc.next_action,
    cc.created_at,
    cc.updated_at,
    cc.closed_at,
    -- Customer context
    COALESCE(
      NULLIF(c.full_name, ''),
      NULLIF(c.email, ''),
      'Unknown Customer'
    ) AS customer_name,
    NULLIF(c.email, '') AS customer_email,
    -- Derived SLA fields (computed in SQL)
    CASE
      WHEN cc.due_at IS NOT NULL
        AND cc.due_at < now()
        AND cc.status <> 'closed'
      THEN true
      ELSE false
    END AS is_overdue,
    CASE
      WHEN cc.due_at IS NOT NULL
        AND cc.due_at >= now()
        AND cc.due_at <= now() + interval '48 hours'
        AND cc.status <> 'closed'
      THEN true
      ELSE false
    END AS is_due_soon,
    -- Days overdue: integer days past due_at (0 if null, closed, or not yet due)
    CASE
      WHEN cc.due_at IS NULL OR cc.status = 'closed' THEN 0
      WHEN cc.due_at >= now() THEN 0
      ELSE FLOOR(EXTRACT(EPOCH FROM (now() - cc.due_at)) / 86400)::int
    END AS days_overdue,
    -- SLA breached: true if due_at < now() and not closed
    CASE
      WHEN cc.due_at IS NULL OR cc.status = 'closed' THEN false
      WHEN cc.due_at < now() THEN true
      ELSE false
    END AS sla_breached
  FROM public.collections_cases cc
  LEFT JOIN public.customers c ON c.id = cc.customer_id AND c.company_id = cc.company_id
  WHERE cc.company_id = v_company_id
    AND (p_status IS NULL OR cc.status = p_status)
    AND (p_assigned_to IS NULL OR cc.assigned_to = p_assigned_to)
  ORDER BY
    -- Priority order: critical, high, normal, low
    CASE cc.priority
      WHEN 'critical' THEN 1
      WHEN 'high' THEN 2
      WHEN 'normal' THEN 3
      WHEN 'low' THEN 4
      ELSE 5
    END,
    -- SLA breached desc (breached cases first)
    CASE
      WHEN cc.due_at IS NULL OR cc.status = 'closed' THEN 1
      WHEN cc.due_at < now() THEN 0
      ELSE 1
    END,
    -- Days overdue desc (most overdue first)
    CASE
      WHEN cc.due_at IS NULL OR cc.status = 'closed' THEN 0
      WHEN cc.due_at >= now() THEN 0
      ELSE FLOOR(EXTRACT(EPOCH FROM (now() - cc.due_at)) / 86400)::int
    END DESC,
    -- Then due_at asc nulls last
    cc.due_at ASC NULLS LAST,
    -- Then updated_at desc
    cc.updated_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_collections_cases_for_company(text, uuid, int, int) TO authenticated;

-- =============================================================================
-- Update RPC 2: get_collections_case_metrics
-- =============================================================================
-- Add sla_breached_count and sla_breach_rate fields.
-- =============================================================================

-- Drop first so we can change RETURNS TABLE signature safely
DROP FUNCTION IF EXISTS public.get_collections_case_metrics(timestamptz);

CREATE FUNCTION public.get_collections_case_metrics(
  p_as_of timestamptz DEFAULT now()
)
RETURNS TABLE (
  open_cases_count numeric,
  overdue_cases_count numeric,
  closed_last_30d_count numeric,
  avg_days_to_close numeric,
  avg_days_open_current numeric,
  sla_breached_count numeric,
  sla_breach_rate numeric
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
  WITH metrics AS (
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
      )::numeric AS avg_days_open_current,
      
      -- sla_breached_count: count where status <> 'closed' and due_at is not null and due_at < p_as_of
      COALESCE(COUNT(*) FILTER (
        WHERE cc.status <> 'closed'
          AND cc.due_at IS NOT NULL
          AND cc.due_at < v_as_of
      ), 0)::numeric AS sla_breached_count
    FROM public.collections_cases cc
    WHERE cc.company_id = v_company_id
  )
  SELECT
    m.open_cases_count,
    m.overdue_cases_count,
    m.closed_last_30d_count,
    m.avg_days_to_close,
    m.avg_days_open_current,
    m.sla_breached_count,
    -- sla_breach_rate: breached_count / nullif(open_cases_count, 0) (return 0 when open_cases_count = 0)
    CASE
      WHEN m.open_cases_count = 0 THEN 0::numeric
      ELSE (m.sla_breached_count / NULLIF(m.open_cases_count, 0))::numeric
    END AS sla_breach_rate
  FROM metrics m;
END;
$$;

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION public.get_collections_case_metrics(timestamptz) TO authenticated;

COMMIT;
