BEGIN;

-- =============================================================================
-- CFO Cockpit Phase C9.5: Priority + SLA Alignment
-- =============================================================================
-- Modifies open_or_get_collections_case to automatically set priority and due_at
-- based on escalation severity when creating new cases.
-- Existing active cases are NOT modified.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.open_or_get_collections_case(
  p_customer_id uuid,
  p_reason text DEFAULT NULL
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
  closed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_company_id uuid;
  v_role text;
  v_case_id uuid;
  v_existing_case record;
  v_escalation_level text;
  v_case_priority text;
  v_case_due_at timestamptz;
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
      MESSAGE = 'Only admins, managers, and dispatchers can open or get collections cases';
  END IF;

  -- 4) Try to find or insert case (idempotent with concurrency safety)
  -- Use a loop to handle race conditions with the partial unique index
  LOOP
    -- Try to find existing active case
    SELECT cc.* INTO v_existing_case
    FROM public.collections_cases cc
    WHERE cc.company_id = v_company_id
      AND cc.customer_id = p_customer_id
      AND cc.status IN ('open', 'in_progress')
    LIMIT 1
    FOR UPDATE;

    -- If found, return it (existing cases are NOT modified)
    IF FOUND THEN
      RETURN QUERY
      SELECT
        v_existing_case.id,
        v_existing_case.company_id,
        v_existing_case.customer_id,
        v_existing_case.status,
        v_existing_case.priority,
        v_existing_case.assigned_to,
        v_existing_case.due_at,
        v_existing_case.next_action,
        v_existing_case.notes,
        v_existing_case.created_by,
        v_existing_case.created_at,
        v_existing_case.updated_at,
        v_existing_case.closed_at;
      RETURN;
    END IF;

    -- Else try to insert new case
    -- First, check for escalation level to determine priority and due_at
    BEGIN
      -- Get escalation level for this customer (if any)
      SELECT e.escalation_level INTO v_escalation_level
      FROM public.get_collections_escalations_for_company(1, now()) e
      WHERE e.customer_id = p_customer_id
      LIMIT 1;

      -- Map escalation_level to priority and due_at
      IF v_escalation_level = 'critical' THEN
        v_case_priority := 'critical';
        v_case_due_at := now() + interval '2 days';
      ELSIF v_escalation_level = 'high' THEN
        v_case_priority := 'high';
        v_case_due_at := now() + interval '5 days';
      ELSE
        -- Default: normal priority, 10 days
        v_case_priority := 'normal';
        v_case_due_at := now() + interval '10 days';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- If escalation check fails, use defaults
      v_case_priority := 'normal';
      v_case_due_at := now() + interval '10 days';
    END;

    -- Insert new case with priority and due_at based on escalation
    BEGIN
      INSERT INTO public.collections_cases (
        company_id,
        customer_id,
        status,
        priority,
        assigned_to,
        due_at,
        next_action,
        notes,
        created_by
      ) VALUES (
        v_company_id,
        p_customer_id,
        'open',
        v_case_priority,
        NULL,
        v_case_due_at,
        NULL,
        NULL,
        auth.uid()
      )
      RETURNING id INTO v_case_id;

      -- Successfully inserted, exit loop
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      -- Another transaction inserted a case, loop to retry
      CONTINUE;
    END;
  END LOOP;

  -- 5) Select and return the newly inserted case
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
    cc.closed_at
  FROM public.collections_cases cc
  WHERE cc.id = v_case_id
    AND cc.company_id = v_company_id;
END;
$$;

-- Grant execute to authenticated (already granted, but ensure it's there)
GRANT EXECUTE ON FUNCTION public.open_or_get_collections_case(uuid, text) TO authenticated;

COMMIT;
