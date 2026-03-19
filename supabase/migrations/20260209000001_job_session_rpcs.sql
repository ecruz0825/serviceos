BEGIN;

-- =============================================================================
-- Job Session RPCs
-- start_job_session: Start tracking job execution time
-- stop_job_session: Stop tracking and complete job (with photo validation)
-- =============================================================================

-- 1) RPC: start_job_session
CREATE OR REPLACE FUNCTION public.start_job_session(p_job_id uuid)
RETURNS TABLE (
  job_id uuid,
  started_at timestamptz,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_role text;
  v_company_id uuid;
  v_job record;
  v_started_at timestamptz;
  v_crew_member_id uuid;
BEGIN
  -- Require authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- Get user role and company
  SELECT p.role, p.company_id INTO v_role, v_company_id
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'NO_COMPANY';
  END IF;

  -- Only crew/admin can start sessions
  IF v_role NOT IN ('admin', 'crew') THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;

  -- Lock and load job with tenant isolation
  SELECT *
  INTO v_job
  FROM public.jobs j
  WHERE j.id = p_job_id
    AND j.company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND';
  END IF;

  -- If job is already completed, reject
  IF v_job.status = 'Completed' OR v_job.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'JOB_ALREADY_COMPLETED';
  END IF;

  -- If already started, return existing started_at (idempotent)
  IF v_job.started_at IS NOT NULL THEN
    job_id := p_job_id;
    started_at := v_job.started_at;
    message := 'Job session already started';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Set started_at
  UPDATE public.jobs
  SET started_at = now()
  WHERE id = p_job_id
    AND company_id = v_company_id;

  -- Get the updated started_at
  SELECT j.started_at INTO v_started_at
  FROM public.jobs j
  WHERE j.id = p_job_id;

  -- Log audit event
  BEGIN
    PERFORM public.insert_audit_log(
      v_company_id,
      'job',
      p_job_id,
      'job_session_started',
      jsonb_build_object(
        'started_at', v_started_at,
        'actor_role', v_role
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Log warning but don't fail the operation
    RAISE WARNING 'Failed to log job session started: %', SQLERRM;
  END;

  -- Return result
  job_id := p_job_id;
  started_at := v_started_at;
  message := 'Job session started';
  RETURN NEXT;
END;
$$;

-- 2) RPC: stop_job_session
CREATE OR REPLACE FUNCTION public.stop_job_session(p_job_id uuid)
RETURNS TABLE (
  job_id uuid,
  completed_at timestamptz,
  duration_seconds integer,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_role text;
  v_company_id uuid;
  v_job record;
  v_started_at timestamptz;
  v_completed_at timestamptz;
  v_duration_seconds integer;
  v_crew_member_id uuid;
  v_team_ids uuid[];
BEGIN
  -- Require authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- Get user role and company
  SELECT p.role, p.company_id INTO v_role, v_company_id
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'NO_COMPANY';
  END IF;

  -- Only crew/admin can stop sessions
  IF v_role NOT IN ('admin', 'crew') THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;

  -- Lock and load job with tenant isolation
  SELECT *
  INTO v_job
  FROM public.jobs j
  WHERE j.id = p_job_id
    AND j.company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND';
  END IF;

  -- If already completed, return existing completed_at (idempotent)
  IF v_job.completed_at IS NOT NULL THEN
    job_id := p_job_id;
    completed_at := v_job.completed_at;
    duration_seconds := NULL;
    IF v_job.started_at IS NOT NULL THEN
      duration_seconds := EXTRACT(EPOCH FROM (v_job.completed_at - v_job.started_at))::integer;
    END IF;
    message := 'Job session already completed';
    RETURN NEXT;
    RETURN;
  END IF;

  -- For crew members: verify job is assigned to their team
  IF v_role = 'crew' THEN
    v_crew_member_id := public.current_crew_member_id();
    IF v_crew_member_id IS NULL THEN
      RAISE EXCEPTION 'CREW_NOT_LINKED';
    END IF;

    -- Get user's team IDs
    SELECT ARRAY_AGG(team_id) INTO v_team_ids
    FROM public.team_members
    WHERE crew_member_id = v_crew_member_id;

    -- Check if job is assigned to user's team
    IF v_job.assigned_team_id IS NULL OR NOT (v_job.assigned_team_id = ANY(v_team_ids)) THEN
      RAISE EXCEPTION 'JOB_NOT_ASSIGNED_TO_TEAM';
    END IF;
  END IF;

  -- Validate photo requirements (same as existing completion check)
  IF v_job.before_image IS NULL OR v_job.after_image IS NULL THEN
    RAISE EXCEPTION 'PHOTOS_REQUIRED' USING
      MESSAGE = 'Before and after photos are required to complete the job';
  END IF;

  -- If started_at is null, set it to now (professional behavior: auto-start)
  v_started_at := COALESCE(v_job.started_at, now());

  -- Calculate duration
  v_completed_at := now();
  v_duration_seconds := EXTRACT(EPOCH FROM (v_completed_at - v_started_at))::integer;

  -- Update job: set started_at (if was null), completed_at, and status
  UPDATE public.jobs
  SET started_at = v_started_at,
      completed_at = v_completed_at,
      status = 'Completed'
  WHERE id = p_job_id
    AND company_id = v_company_id;

  -- Log audit event with duration
  BEGIN
    PERFORM public.insert_audit_log(
      v_company_id,
      'job',
      p_job_id,
      'job_session_stopped',
      jsonb_build_object(
        'started_at', v_started_at,
        'completed_at', v_completed_at,
        'duration_seconds', v_duration_seconds,
        'actor_role', v_role
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Log warning but don't fail the operation
    RAISE WARNING 'Failed to log job session stopped: %', SQLERRM;
  END;

  -- Return result
  job_id := p_job_id;
  completed_at := v_completed_at;
  duration_seconds := v_duration_seconds;
  message := 'Job session completed';
  RETURN NEXT;
END;
$$;

-- 3) Grant execute permissions
GRANT EXECUTE ON FUNCTION public.start_job_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stop_job_session(uuid) TO authenticated;

COMMIT;
