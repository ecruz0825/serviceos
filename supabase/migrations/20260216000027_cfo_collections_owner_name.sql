BEGIN;

-- =============================================================================
-- CFO Cockpit Polish: Owner Name in Cases Queue
-- =============================================================================
-- Adds assigned_owner_name to get_collections_cases_for_company.
-- DB-first. No client joins. No client drift.
-- =============================================================================

-- =============================================================================
-- Update RPC: get_collections_cases_for_company
-- =============================================================================
-- Add assigned_owner_name column by joining with profiles table.
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
  sla_breached boolean,
  assigned_owner_name text
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

  -- 5) Return filtered and ordered cases with SLA discipline fields and owner name
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
    END AS sla_breached,
    -- Assigned owner name: full_name or email from profiles
    COALESCE(p.full_name, p.email) AS assigned_owner_name
  FROM public.collections_cases cc
  LEFT JOIN public.customers c ON c.id = cc.customer_id AND c.company_id = cc.company_id
  LEFT JOIN public.profiles p ON p.id = cc.assigned_to AND p.company_id = cc.company_id
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

COMMIT;
