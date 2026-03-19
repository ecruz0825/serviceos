-- =============================================================================
-- CFO Collections Cases Read RPCs (Phase C8)
-- =============================================================================
-- Read-only RPCs for viewing collections cases as a queue and detail view.
-- All derived values computed in SQL. No client math.
-- =============================================================================

BEGIN;

-- =============================================================================
-- RPC 1: get_collections_cases_for_company
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_collections_cases_for_company(
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
  is_due_soon boolean
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

  -- 5) Return filtered and ordered cases
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
    END AS is_due_soon
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
    -- Then is_overdue desc
    CASE
      WHEN cc.due_at IS NOT NULL
        AND cc.due_at < now()
        AND cc.status <> 'closed'
      THEN 0
      ELSE 1
    END,
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
-- RPC 2: get_collections_case_detail
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_collections_case_detail(
  p_case_id uuid
)
RETURNS TABLE (
  id uuid,
  company_id uuid,
  customer_id uuid,
  status text,
  priority text,
  assigned_to uuid,
  due_at timestamptz,
  next_action text,
  notes text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  closed_at timestamptz,
  customer_name text,
  customer_email text,
  customer_phone text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_company_id uuid;
  v_role text;
  v_case_exists boolean;
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
      MESSAGE = 'Only admins, managers, and dispatchers can view collections case details';
  END IF;

  -- 4) Check if case exists and belongs to company
  SELECT EXISTS(
    SELECT 1
    FROM public.collections_cases cc
    WHERE cc.id = p_case_id
      AND cc.company_id = v_company_id
  ) INTO v_case_exists;

  IF NOT v_case_exists THEN
    RAISE EXCEPTION 'CASE_NOT_FOUND' USING
      MESSAGE = 'Collections case not found or does not belong to your company';
  END IF;

  -- 5) Return case detail with customer context
  RETURN QUERY
  SELECT
    cc.id,
    cc.company_id,
    cc.customer_id,
    cc.status,
    cc.priority,
    cc.assigned_to,
    cc.due_at,
    cc.next_action,
    cc.notes,
    cc.created_by,
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
    NULLIF(c.phone, '') AS customer_phone
  FROM public.collections_cases cc
  LEFT JOIN public.customers c ON c.id = cc.customer_id AND c.company_id = cc.company_id
  WHERE cc.id = p_case_id
    AND cc.company_id = v_company_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_collections_case_detail(uuid) TO authenticated;

COMMIT;
