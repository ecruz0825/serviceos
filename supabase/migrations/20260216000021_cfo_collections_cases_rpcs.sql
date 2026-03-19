-- =============================================================================
-- CFO Collections Cases RPCs (Phase C8)
-- =============================================================================
-- Case lifecycle RPCs for managing collections cases.
-- All writes via RPCs. Frontend should NOT insert/update collections_cases directly.
-- =============================================================================

BEGIN;

-- =============================================================================
-- RPC 1: open_or_get_collections_case
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

    -- If found, return it
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
        'normal',
        NULL,
        now() + interval '10 days',
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

GRANT EXECUTE ON FUNCTION public.open_or_get_collections_case(uuid, text) TO authenticated;

-- =============================================================================
-- RPC 2: assign_collections_case
-- =============================================================================

CREATE OR REPLACE FUNCTION public.assign_collections_case(
  p_case_id uuid,
  p_assigned_to uuid
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
  v_case record;
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
      MESSAGE = 'Only admins, managers, and dispatchers can assign collections cases';
  END IF;

  -- 4) Load case and verify company_id matches
  SELECT cc.* INTO v_case
  FROM public.collections_cases cc
  WHERE cc.id = p_case_id
    AND cc.company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CASE_NOT_FOUND' USING
      MESSAGE = 'Collections case not found or does not belong to your company';
  END IF;

  -- 5) Update case: assign and auto-promote to in_progress if open
  UPDATE public.collections_cases cc
  SET
    assigned_to = p_assigned_to,
    status = CASE
      WHEN cc.status = 'open' THEN 'in_progress'
      ELSE cc.status
    END,
    updated_at = now()
  WHERE cc.id = p_case_id
    AND cc.company_id = v_company_id
  RETURNING cc.* INTO v_case;

  -- 6) Return updated row
  RETURN QUERY
  SELECT
    v_case.id,
    v_case.company_id,
    v_case.customer_id,
    v_case.status,
    v_case.priority,
    v_case.assigned_to,
    v_case.due_at,
    v_case.next_action,
    v_case.notes,
    v_case.created_by,
    v_case.created_at,
    v_case.updated_at,
    v_case.closed_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_collections_case(uuid, uuid) TO authenticated;

-- =============================================================================
-- RPC 3: set_collections_case_status
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_collections_case_status(
  p_case_id uuid,
  p_status text,
  p_closed_at timestamptz DEFAULT NULL
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
  v_case record;
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
      MESSAGE = 'Only admins, managers, and dispatchers can set collections case status';
  END IF;

  -- 4) Validate status
  IF p_status NOT IN ('open', 'in_progress', 'closed') THEN
    RAISE EXCEPTION 'INVALID_STATUS' USING
      MESSAGE = 'Status must be one of: open, in_progress, closed';
  END IF;

  -- 5) Load case and verify company_id matches
  SELECT cc.* INTO v_case
  FROM public.collections_cases cc
  WHERE cc.id = p_case_id
    AND cc.company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CASE_NOT_FOUND' USING
      MESSAGE = 'Collections case not found or does not belong to your company';
  END IF;

  -- 6) Update case status and closed_at
  UPDATE public.collections_cases cc
  SET
    status = p_status,
    closed_at = CASE
      WHEN p_status = 'closed' THEN COALESCE(p_closed_at, now())
      ELSE NULL
    END,
    updated_at = now()
  WHERE cc.id = p_case_id
    AND cc.company_id = v_company_id
  RETURNING cc.* INTO v_case;

  -- 7) Return updated row
  RETURN QUERY
  SELECT
    v_case.id,
    v_case.company_id,
    v_case.customer_id,
    v_case.status,
    v_case.priority,
    v_case.assigned_to,
    v_case.due_at,
    v_case.next_action,
    v_case.notes,
    v_case.created_by,
    v_case.created_at,
    v_case.updated_at,
    v_case.closed_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_collections_case_status(uuid, text, timestamptz) TO authenticated;

-- =============================================================================
-- RPC 4: set_collections_case_due_at
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_collections_case_due_at(
  p_case_id uuid,
  p_due_at timestamptz
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
  v_case record;
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
      MESSAGE = 'Only admins, managers, and dispatchers can set collections case due date';
  END IF;

  -- 4) Load case and verify company_id matches
  SELECT cc.* INTO v_case
  FROM public.collections_cases cc
  WHERE cc.id = p_case_id
    AND cc.company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CASE_NOT_FOUND' USING
      MESSAGE = 'Collections case not found or does not belong to your company';
  END IF;

  -- 5) Update due_at
  UPDATE public.collections_cases cc
  SET
    due_at = p_due_at,
    updated_at = now()
  WHERE cc.id = p_case_id
    AND cc.company_id = v_company_id
  RETURNING cc.* INTO v_case;

  -- 6) Return updated row
  RETURN QUERY
  SELECT
    v_case.id,
    v_case.company_id,
    v_case.customer_id,
    v_case.status,
    v_case.priority,
    v_case.assigned_to,
    v_case.due_at,
    v_case.next_action,
    v_case.notes,
    v_case.created_by,
    v_case.created_at,
    v_case.updated_at,
    v_case.closed_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_collections_case_due_at(uuid, timestamptz) TO authenticated;

-- =============================================================================
-- RPC 5: set_collections_case_next_action
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_collections_case_next_action(
  p_case_id uuid,
  p_next_action text
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
  v_case record;
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
      MESSAGE = 'Only admins, managers, and dispatchers can set collections case next action';
  END IF;

  -- 4) Load case and verify company_id matches
  SELECT cc.* INTO v_case
  FROM public.collections_cases cc
  WHERE cc.id = p_case_id
    AND cc.company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CASE_NOT_FOUND' USING
      MESSAGE = 'Collections case not found or does not belong to your company';
  END IF;

  -- 5) Update next_action
  UPDATE public.collections_cases cc
  SET
    next_action = p_next_action,
    updated_at = now()
  WHERE cc.id = p_case_id
    AND cc.company_id = v_company_id
  RETURNING cc.* INTO v_case;

  -- 6) Return updated row
  RETURN QUERY
  SELECT
    v_case.id,
    v_case.company_id,
    v_case.customer_id,
    v_case.status,
    v_case.priority,
    v_case.assigned_to,
    v_case.due_at,
    v_case.next_action,
    v_case.notes,
    v_case.created_by,
    v_case.created_at,
    v_case.updated_at,
    v_case.closed_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_collections_case_next_action(uuid, text) TO authenticated;

-- =============================================================================
-- RPC 6: append_collections_case_note
-- =============================================================================

CREATE OR REPLACE FUNCTION public.append_collections_case_note(
  p_case_id uuid,
  p_note text
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
  v_case record;
  v_new_note text;
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
      MESSAGE = 'Only admins, managers, and dispatchers can append collections case notes';
  END IF;

  -- 4) Load case and verify company_id matches
  SELECT cc.* INTO v_case
  FROM public.collections_cases cc
  WHERE cc.id = p_case_id
    AND cc.company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CASE_NOT_FOUND' USING
      MESSAGE = 'Collections case not found or does not belong to your company';
  END IF;

  -- 5) Append note (do NOT overwrite)
  v_new_note := TRIM(BOTH FROM COALESCE(v_case.notes, '') || E'\n\n' || 
    TO_CHAR(now(), 'YYYY-MM-DD HH24:MI') || ' — ' || p_note);

  -- 6) Update notes
  UPDATE public.collections_cases cc
  SET
    notes = v_new_note,
    updated_at = now()
  WHERE cc.id = p_case_id
    AND cc.company_id = v_company_id
  RETURNING cc.* INTO v_case;

  -- 7) Return updated row
  RETURN QUERY
  SELECT
    v_case.id,
    v_case.company_id,
    v_case.customer_id,
    v_case.status,
    v_case.priority,
    v_case.assigned_to,
    v_case.due_at,
    v_case.next_action,
    v_case.notes,
    v_case.created_by,
    v_case.created_at,
    v_case.updated_at,
    v_case.closed_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.append_collections_case_note(uuid, text) TO authenticated;

COMMIT;
