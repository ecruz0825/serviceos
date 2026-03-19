BEGIN;

-- =============================================================================
-- Phase 4: Crew Notes + Job Issue Flags + RevenueHub "Needs Attention" Queue
-- =============================================================================
-- Enables crew to add notes and flag issues on jobs. Admin sees flagged jobs
-- in RevenueHub "Needs Attention" queue with quick actions.
--
-- Features:
-- - Multi-tenant (company_id) enforced everywhere
-- - Crew can only write/read notes for jobs assigned to their team
-- - Admin/manager/dispatcher can read/write for tenant
-- - Audit log entries for flag created/resolved
-- =============================================================================

-- =============================================================================
-- 1) Create job_notes table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.job_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES auth.users(id),
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_job_notes_job_id ON public.job_notes(job_id);
CREATE INDEX IF NOT EXISTS idx_job_notes_company_id ON public.job_notes(company_id);
CREATE INDEX IF NOT EXISTS idx_job_notes_created_at ON public.job_notes(created_at DESC);

-- =============================================================================
-- 2) Create job_flags table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.job_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'open',  -- open | resolved
  severity text NOT NULL DEFAULT 'medium',  -- low | medium | high
  category text NOT NULL DEFAULT 'other',  -- access | equipment | scope | safety | customer | other
  message text NOT NULL,
  resolved_at timestamptz NULL,
  resolved_by uuid NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_flags_status_check'
  ) THEN
    ALTER TABLE public.job_flags
      ADD CONSTRAINT job_flags_status_check CHECK (status IN ('open', 'resolved'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_flags_severity_check'
  ) THEN
    ALTER TABLE public.job_flags
      ADD CONSTRAINT job_flags_severity_check CHECK (severity IN ('low', 'medium', 'high'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_flags_category_check'
  ) THEN
    ALTER TABLE public.job_flags
      ADD CONSTRAINT job_flags_category_check CHECK (category IN ('access', 'equipment', 'scope', 'safety', 'customer', 'other'));
  END IF;
END$$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_job_flags_job_id ON public.job_flags(job_id);
CREATE INDEX IF NOT EXISTS idx_job_flags_company_id ON public.job_flags(company_id);
CREATE INDEX IF NOT EXISTS idx_job_flags_status ON public.job_flags(status) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_job_flags_created_at ON public.job_flags(created_at DESC);

-- =============================================================================
-- 3) RLS Policies for job_notes
-- =============================================================================
ALTER TABLE public.job_notes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotency)
DROP POLICY IF EXISTS job_notes_select_admin ON public.job_notes;
DROP POLICY IF EXISTS job_notes_select_crew ON public.job_notes;
DROP POLICY IF EXISTS job_notes_insert_admin ON public.job_notes;
DROP POLICY IF EXISTS job_notes_insert_crew ON public.job_notes;

-- SELECT: Admin/manager/dispatcher can see all company notes
CREATE POLICY job_notes_select_admin
ON public.job_notes
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_user_role() IN ('admin', 'manager', 'dispatcher')
);

-- SELECT: Crew can see notes for jobs assigned to their team
CREATE POLICY job_notes_select_crew
ON public.job_notes
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_user_role() = 'crew'
  AND EXISTS (
    SELECT 1
    FROM public.jobs j
    WHERE j.id = job_notes.job_id
      AND j.company_id = job_notes.company_id
      AND (
        -- Team-based assignment
        (j.assigned_team_id IS NOT NULL AND EXISTS (
          SELECT 1
          FROM public.team_members tm
          WHERE tm.team_id = j.assigned_team_id
            AND tm.crew_member_id = public.current_crew_member_id()
        ))
        OR
        -- Legacy assigned_to
        (j.assigned_team_id IS NULL AND j.assigned_to = public.current_crew_member_id())
      )
  )
);

-- INSERT: Admin/manager/dispatcher can insert for any company job
CREATE POLICY job_notes_insert_admin
ON public.job_notes
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.current_company_id()
  AND public.current_user_role() IN ('admin', 'manager', 'dispatcher')
);

-- INSERT: Crew can insert for jobs assigned to their team
CREATE POLICY job_notes_insert_crew
ON public.job_notes
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.current_company_id()
  AND public.current_user_role() = 'crew'
  AND EXISTS (
    SELECT 1
    FROM public.jobs j
    WHERE j.id = job_notes.job_id
      AND j.company_id = job_notes.company_id
      AND (
        -- Team-based assignment
        (j.assigned_team_id IS NOT NULL AND EXISTS (
          SELECT 1
          FROM public.team_members tm
          WHERE tm.team_id = j.assigned_team_id
            AND tm.crew_member_id = public.current_crew_member_id()
        ))
        OR
        -- Legacy assigned_to
        (j.assigned_team_id IS NULL AND j.assigned_to = public.current_crew_member_id())
      )
  )
);

-- =============================================================================
-- 4) RLS Policies for job_flags
-- =============================================================================
ALTER TABLE public.job_flags ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotency)
DROP POLICY IF EXISTS job_flags_select_admin ON public.job_flags;
DROP POLICY IF EXISTS job_flags_select_crew ON public.job_flags;
DROP POLICY IF EXISTS job_flags_insert_admin ON public.job_flags;
DROP POLICY IF EXISTS job_flags_insert_crew ON public.job_flags;
DROP POLICY IF EXISTS job_flags_update_admin ON public.job_flags;

-- SELECT: Admin/manager/dispatcher can see all company flags
CREATE POLICY job_flags_select_admin
ON public.job_flags
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_user_role() IN ('admin', 'manager', 'dispatcher')
);

-- SELECT: Crew can see flags for jobs assigned to their team
CREATE POLICY job_flags_select_crew
ON public.job_flags
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_user_role() = 'crew'
  AND EXISTS (
    SELECT 1
    FROM public.jobs j
    WHERE j.id = job_flags.job_id
      AND j.company_id = job_flags.company_id
      AND (
        -- Team-based assignment
        (j.assigned_team_id IS NOT NULL AND EXISTS (
          SELECT 1
          FROM public.team_members tm
          WHERE tm.team_id = j.assigned_team_id
            AND tm.crew_member_id = public.current_crew_member_id()
        ))
        OR
        -- Legacy assigned_to
        (j.assigned_team_id IS NULL AND j.assigned_to = public.current_crew_member_id())
      )
  )
);

-- INSERT: Admin/manager/dispatcher can insert for any company job
CREATE POLICY job_flags_insert_admin
ON public.job_flags
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.current_company_id()
  AND public.current_user_role() IN ('admin', 'manager', 'dispatcher')
);

-- INSERT: Crew can insert for jobs assigned to their team
CREATE POLICY job_flags_insert_crew
ON public.job_flags
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.current_company_id()
  AND public.current_user_role() = 'crew'
  AND EXISTS (
    SELECT 1
    FROM public.jobs j
    WHERE j.id = job_flags.job_id
      AND j.company_id = job_flags.company_id
      AND (
        -- Team-based assignment
        (j.assigned_team_id IS NOT NULL AND EXISTS (
          SELECT 1
          FROM public.team_members tm
          WHERE tm.team_id = j.assigned_team_id
            AND tm.crew_member_id = public.current_crew_member_id()
        ))
        OR
        -- Legacy assigned_to
        (j.assigned_team_id IS NULL AND j.assigned_to = public.current_crew_member_id())
      )
  )
);

-- UPDATE: Only admin/manager/dispatcher can update (resolve flags)
CREATE POLICY job_flags_update_admin
ON public.job_flags
FOR UPDATE
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_user_role() IN ('admin', 'manager', 'dispatcher')
)
WITH CHECK (
  company_id = public.current_company_id()
  AND public.current_user_role() IN ('admin', 'manager', 'dispatcher')
);

-- =============================================================================
-- 5) RPC: crew_add_job_note
-- =============================================================================
CREATE OR REPLACE FUNCTION public.crew_add_job_note(
  p_job_id uuid,
  p_note text
)
RETURNS TABLE (
  id uuid,
  company_id uuid,
  job_id uuid,
  author_user_id uuid,
  note text,
  created_at timestamptz,
  metadata jsonb
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
  v_note_id uuid;
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

  IF v_role NOT IN ('admin', 'crew', 'manager', 'dispatcher') THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;

  IF p_note IS NULL OR trim(p_note) = '' THEN
    RAISE EXCEPTION 'INVALID_NOTE';
  END IF;

  -- Lock job row and validate
  SELECT *
  INTO v_job
  FROM public.jobs j
  WHERE j.id = p_job_id
    AND j.company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND';
  END IF;

  -- Crew can only add notes for jobs assigned to their team
  IF v_role = 'crew' THEN
    v_crew_member_id := public.current_crew_member_id();
    IF v_crew_member_id IS NULL THEN
      RAISE EXCEPTION 'CREW_NOT_LINKED';
    END IF;

    -- Check if job uses team-based assignment
    IF v_job.assigned_team_id IS NOT NULL THEN
      -- Team-based: verify crew member is on the assigned team
      IF NOT EXISTS (
        SELECT 1
        FROM public.team_members tm
        WHERE tm.team_id = v_job.assigned_team_id
          AND tm.crew_member_id = v_crew_member_id
      ) THEN
        RAISE EXCEPTION 'forbidden_job_not_assigned_to_team';
      END IF;
    ELSE
      -- Legacy: fall back to assigned_to check
      IF v_job.assigned_to IS NULL OR v_job.assigned_to <> v_crew_member_id THEN
        RAISE EXCEPTION 'JOB_NOT_ASSIGNED_TO_CREW';
      END IF;
    END IF;
  END IF;

  -- Insert note
  INSERT INTO public.job_notes (
    company_id,
    job_id,
    author_user_id,
    note
  )
  VALUES (
    v_company_id,
    p_job_id,
    auth.uid(),
    trim(p_note)
  )
  RETURNING job_notes.id INTO v_note_id;

  -- Return the inserted row
  RETURN QUERY
  SELECT
    jn.id,
    jn.company_id,
    jn.job_id,
    jn.author_user_id,
    jn.note,
    jn.created_at,
    jn.metadata
  FROM public.job_notes jn
  WHERE jn.id = v_note_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crew_add_job_note(uuid, text) TO authenticated;

-- =============================================================================
-- 6) RPC: crew_flag_job_issue
-- =============================================================================
CREATE OR REPLACE FUNCTION public.crew_flag_job_issue(
  p_job_id uuid,
  p_category text,
  p_severity text,
  p_message text
)
RETURNS TABLE (
  id uuid,
  company_id uuid,
  job_id uuid,
  created_by uuid,
  status text,
  severity text,
  category text,
  message text,
  resolved_at timestamptz,
  resolved_by uuid,
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

  IF v_role NOT IN ('admin', 'crew', 'manager', 'dispatcher') THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;

  -- Validate category
  IF p_category NOT IN ('access', 'equipment', 'scope', 'safety', 'customer', 'other') THEN
    RAISE EXCEPTION 'INVALID_CATEGORY';
  END IF;

  -- Validate severity
  IF p_severity NOT IN ('low', 'medium', 'high') THEN
    RAISE EXCEPTION 'INVALID_SEVERITY';
  END IF;

  IF p_message IS NULL OR trim(p_message) = '' THEN
    RAISE EXCEPTION 'INVALID_MESSAGE';
  END IF;

  -- Lock job row and validate
  SELECT *
  INTO v_job
  FROM public.jobs j
  WHERE j.id = p_job_id
    AND j.company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND';
  END IF;

  -- Crew can only flag issues for jobs assigned to their team
  IF v_role = 'crew' THEN
    v_crew_member_id := public.current_crew_member_id();
    IF v_crew_member_id IS NULL THEN
      RAISE EXCEPTION 'CREW_NOT_LINKED';
    END IF;

    -- Check if job uses team-based assignment
    IF v_job.assigned_team_id IS NOT NULL THEN
      -- Team-based: verify crew member is on the assigned team
      IF NOT EXISTS (
        SELECT 1
        FROM public.team_members tm
        WHERE tm.team_id = v_job.assigned_team_id
          AND tm.crew_member_id = v_crew_member_id
      ) THEN
        RAISE EXCEPTION 'forbidden_job_not_assigned_to_team';
      END IF;
    ELSE
      -- Legacy: fall back to assigned_to check
      IF v_job.assigned_to IS NULL OR v_job.assigned_to <> v_crew_member_id THEN
        RAISE EXCEPTION 'JOB_NOT_ASSIGNED_TO_CREW';
      END IF;
    END IF;
  END IF;

  -- Insert flag
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
    auth.uid(),
    'open',
    p_severity,
    p_category,
    trim(p_message)
  )
  RETURNING job_flags.id INTO v_flag_id;

  -- Log audit entry
  BEGIN
    PERFORM public.insert_audit_log(
      p_company_id := v_company_id,
      p_entity_type := 'job_flag',
      p_entity_id := v_flag_id,
      p_action := 'job_flag_created',
      p_metadata := jsonb_build_object(
        'flag_id', v_flag_id,
        'job_id', p_job_id,
        'category', p_category,
        'severity', p_severity,
        'message', trim(p_message)
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Log warning but don't fail the operation
    RAISE WARNING 'Failed to log flag audit: %', SQLERRM;
  END;

  -- Return the inserted row
  RETURN QUERY
  SELECT
    jf.id,
    jf.company_id,
    jf.job_id,
    jf.created_by,
    jf.status,
    jf.severity,
    jf.category,
    jf.message,
    jf.resolved_at,
    jf.resolved_by,
    jf.created_at
  FROM public.job_flags jf
  WHERE jf.id = v_flag_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.crew_flag_job_issue(uuid, text, text, text) TO authenticated;

-- =============================================================================
-- 7) RPC: admin_resolve_job_flag
-- =============================================================================
CREATE OR REPLACE FUNCTION public.admin_resolve_job_flag(
  p_flag_id uuid,
  p_resolution_note text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  company_id uuid,
  job_id uuid,
  created_by uuid,
  status text,
  severity text,
  category text,
  message text,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_role text;
  v_company_id uuid;
  v_flag record;
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

  IF v_role NOT IN ('admin', 'manager', 'dispatcher') THEN
    RAISE EXCEPTION 'ADMIN_ONLY';
  END IF;

  -- Lock flag row and validate
  SELECT *
  INTO v_flag
  FROM public.job_flags jf
  WHERE jf.id = p_flag_id
    AND jf.company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FLAG_NOT_FOUND';
  END IF;

  IF v_flag.status = 'resolved' THEN
    RAISE EXCEPTION 'FLAG_ALREADY_RESOLVED';
  END IF;

  -- Update flag to resolved
  UPDATE public.job_flags
  SET
    status = 'resolved',
    resolved_at = now(),
    resolved_by = auth.uid()
  WHERE id = p_flag_id;

  -- Optionally add a note if resolution note provided
  IF p_resolution_note IS NOT NULL AND trim(p_resolution_note) <> '' THEN
    INSERT INTO public.job_notes (
      company_id,
      job_id,
      author_user_id,
      note
    )
    VALUES (
      v_company_id,
      v_flag.job_id,
      auth.uid(),
      '[Resolution] ' || trim(p_resolution_note)
    );
  END IF;

  -- Log audit entry
  BEGIN
    PERFORM public.insert_audit_log(
      p_company_id := v_company_id,
      p_entity_type := 'job_flag',
      p_entity_id := p_flag_id,
      p_action := 'job_flag_resolved',
      p_metadata := jsonb_build_object(
        'flag_id', p_flag_id,
        'job_id', v_flag.job_id,
        'resolved_by', auth.uid(),
        'resolution_note', p_resolution_note
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Log warning but don't fail the operation
    RAISE WARNING 'Failed to log flag resolution audit: %', SQLERRM;
  END;

  -- Return the updated row
  RETURN QUERY
  SELECT
    jf.id,
    jf.company_id,
    jf.job_id,
    jf.created_by,
    jf.status,
    jf.severity,
    jf.category,
    jf.message,
    jf.resolved_at,
    jf.resolved_by,
    jf.created_at
  FROM public.job_flags jf
  WHERE jf.id = p_flag_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_resolve_job_flag(uuid, text) TO authenticated;

COMMIT;
