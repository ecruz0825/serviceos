BEGIN;

-- =============================================================================
-- Fix: crew_flag_job_issue RPC missing created_by in INSERT
-- Bug: RPC inserts into job_flags without created_by, causing NOT NULL constraint violation
-- Fix: Add created_by = auth.uid() to the INSERT statement
-- =============================================================================

CREATE OR REPLACE FUNCTION public.crew_flag_job_issue(
  p_job_id uuid,
  p_category text,
  p_message text,
  p_severity text DEFAULT 'medium'
)
RETURNS TABLE (
  id uuid,
  company_id uuid,
  job_id uuid,
  status text,
  severity text,
  category text,
  message text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_role text;
  v_company_id uuid;
  v_job record;
  v_crew_member_id uuid;
  v_flag_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT p.role, p.company_id INTO v_role, v_company_id
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'NO_COMPANY';
  END IF;

  IF v_role <> 'crew' THEN
    RAISE EXCEPTION 'CREW_ONLY';
  END IF;

  -- Get job
  SELECT * INTO v_job
  FROM public.jobs j
  WHERE j.id = p_job_id
    AND j.company_id = v_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND';
  END IF;

  -- Verify crew member is on the job's assigned team
  v_crew_member_id := public.current_crew_member_id();
  IF v_crew_member_id IS NULL THEN
    RAISE EXCEPTION 'CREW_NOT_LINKED';
  END IF;

  -- Team-based assignment only (assigned_to removed)
  IF v_job.assigned_team_id IS NULL THEN
    RAISE EXCEPTION 'JOB_NOT_ASSIGNED_TO_TEAM';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.team_members tm
    WHERE tm.team_id = v_job.assigned_team_id
      AND tm.crew_member_id = v_crew_member_id
  ) THEN
    RAISE EXCEPTION 'forbidden_job_not_assigned_to_team';
  END IF;

  -- Insert flag with created_by set
  INSERT INTO public.job_flags (
    company_id,
    job_id,
    created_by,
    status,
    severity,
    category,
    message
  )
  VALUES (
    v_company_id,
    p_job_id,
    auth.uid(), -- Fix: Include created_by from authenticated user
    'open',
    p_severity,
    p_category,
    trim(p_message)
  )
  RETURNING job_flags.id INTO v_flag_id;

  -- Return the inserted row
  RETURN QUERY
  SELECT
    jf.id,
    jf.company_id,
    jf.job_id,
    jf.status,
    jf.severity,
    jf.category,
    jf.message,
    jf.created_at
  FROM public.job_flags jf
  WHERE jf.id = v_flag_id;
END;
$$;

COMMIT;
