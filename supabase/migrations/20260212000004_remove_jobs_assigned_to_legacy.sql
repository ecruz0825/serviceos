-- =============================================================================
-- Remove jobs.assigned_to Legacy Column
-- =============================================================================
-- Context: legacy_jobs=0 (all jobs have been migrated to assigned_team_id)
-- This migration is safe to run as all jobs now use team-based assignment.
--
-- Actions:
-- A) Drop trigger/function that blocks writes to assigned_to
-- B) Update RLS policies to remove assigned_to fallback logic
-- C) Update RPC functions to remove assigned_to fallback logic
-- D) Drop the assigned_to column
-- =============================================================================

BEGIN;

-- =============================================================================
-- A) Drop trigger and function that blocks writes to jobs.assigned_to
-- =============================================================================

DROP TRIGGER IF EXISTS block_jobs_assigned_to_write_trigger ON public.jobs;
DROP FUNCTION IF EXISTS public.block_jobs_assigned_to_write();

-- =============================================================================
-- B) Update RLS policies to remove assigned_to fallback logic
-- =============================================================================

-- Update payments_select_crew_assigned policy
DROP POLICY IF EXISTS payments_select_crew_assigned ON public.payments;

CREATE POLICY payments_select_crew_assigned
ON public.payments
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_user_role() = 'crew'::text
  AND EXISTS (
    SELECT 1
    FROM public.jobs j
    WHERE j.id = payments.job_id
      AND j.company_id = payments.company_id
      AND j.assigned_team_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.team_members tm
        WHERE tm.team_id = j.assigned_team_id
          AND tm.crew_member_id = public.current_crew_member_id()
      )
  )
);

-- Update job_notes_select_crew policy
DROP POLICY IF EXISTS job_notes_select_crew ON public.job_notes;

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
      AND j.assigned_team_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.team_members tm
        WHERE tm.team_id = j.assigned_team_id
          AND tm.crew_member_id = public.current_crew_member_id()
      )
  )
);

-- Update job_notes_insert_crew policy
DROP POLICY IF EXISTS job_notes_insert_crew ON public.job_notes;

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
      AND j.assigned_team_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.team_members tm
        WHERE tm.team_id = j.assigned_team_id
          AND tm.crew_member_id = public.current_crew_member_id()
      )
  )
);

-- Update job_flags_select_crew policy
DROP POLICY IF EXISTS job_flags_select_crew ON public.job_flags;

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
      AND j.assigned_team_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.team_members tm
        WHERE tm.team_id = j.assigned_team_id
          AND tm.crew_member_id = public.current_crew_member_id()
      )
  )
);

-- Update job_flags_insert_crew policy
DROP POLICY IF EXISTS job_flags_insert_crew ON public.job_flags;

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
      AND j.assigned_team_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.team_members tm
        WHERE tm.team_id = j.assigned_team_id
          AND tm.crew_member_id = public.current_crew_member_id()
      )
  )
);

-- Update customer_activity_log_select_crew policy
DROP POLICY IF EXISTS customer_activity_log_select_crew ON public.customer_activity_log;

CREATE POLICY customer_activity_log_select_crew
ON public.customer_activity_log
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'crew'
  AND customer_id IN (
    SELECT DISTINCT j.customer_id
    FROM public.jobs j
    WHERE j.company_id = public.current_company_id()
      AND j.assigned_team_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.team_members tm
        WHERE tm.team_id = j.assigned_team_id
          AND tm.crew_member_id = public.current_crew_member_id()
      )
  )
);

-- Update customer_files_select_crew policy
DROP POLICY IF EXISTS customer_files_select_crew ON public.customer_files;

CREATE POLICY customer_files_select_crew
ON public.customer_files
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'crew'
  AND customer_id IN (
    SELECT DISTINCT j.customer_id
    FROM public.jobs j
    WHERE j.company_id = public.current_company_id()
      AND j.assigned_team_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.team_members tm
        WHERE tm.team_id = j.assigned_team_id
          AND tm.crew_member_id = public.current_crew_member_id()
      )
  )
);

-- Update tenant_select_overpayments policy (overpayments_log table)
DROP POLICY IF EXISTS tenant_select_overpayments ON public.overpayments_log;

CREATE POLICY tenant_select_overpayments
ON public.overpayments_log
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND (
    public.current_user_role() IN ('admin', 'manager', 'dispatcher')
    OR (
      public.current_user_role() = 'crew'
      AND EXISTS (
        SELECT 1
        FROM public.jobs j
        WHERE j.id = overpayments_log.job_id
          AND j.company_id = overpayments_log.company_id
          AND j.assigned_team_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.team_members tm
            WHERE tm.team_id = j.assigned_team_id
              AND tm.crew_member_id = public.current_crew_member_id()
          )
      )
    )
  )
);

-- Update payment_receipts_select_crew policy
DROP POLICY IF EXISTS payment_receipts_select_crew ON public.payment_receipts;

CREATE POLICY payment_receipts_select_crew
ON public.payment_receipts
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_user_role() = 'crew'
  AND EXISTS (
    SELECT 1
    FROM public.payments p
    INNER JOIN public.jobs j ON j.id = p.job_id
    WHERE p.id = payment_receipts.payment_id
      AND p.company_id = public.current_company_id()
      AND j.company_id = public.current_company_id()
      AND j.assigned_team_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.team_members tm
        WHERE tm.team_id = j.assigned_team_id
          AND tm.crew_member_id = public.current_crew_member_id()
      )
  )
);

-- Update payment_receipts_select_customer policy (no assigned_to reference, but ensure it's correct)
DROP POLICY IF EXISTS payment_receipts_select_customer ON public.payment_receipts;

CREATE POLICY payment_receipts_select_customer
ON public.payment_receipts
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_user_role() = 'customer'
  AND EXISTS (
    SELECT 1
    FROM public.payments p
    INNER JOIN public.jobs j ON j.id = p.job_id
    INNER JOIN public.customers c ON c.id = j.customer_id
    WHERE p.id = payment_receipts.payment_id
      AND p.company_id = public.current_company_id()
      AND c.user_id = auth.uid()
      AND c.company_id = public.current_company_id()
  )
);

-- Update payments_select_customer_own_jobs policy (no assigned_to reference, but ensure it's correct)
DROP POLICY IF EXISTS payments_select_customer_own_jobs ON public.payments;

CREATE POLICY payments_select_customer_own_jobs
ON public.payments
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_user_role() = 'customer'
  AND EXISTS (
    SELECT 1
    FROM public.jobs j
    JOIN public.customers c ON c.id = j.customer_id
    WHERE j.id = payments.job_id
      AND j.company_id = payments.company_id
      AND c.user_id = auth.uid()
      AND c.company_id = payments.company_id
  )
);

-- =============================================================================
-- C) Update RPC functions to remove assigned_to fallback logic
-- =============================================================================

-- Drop legacy record_payment_legacy function (truly legacy, replaced by record_payment with invoice_id)
DROP FUNCTION IF EXISTS public.record_payment_legacy(uuid, numeric, text, text, text);

-- Update stop_job_session() RPC - remove assigned_to fallback
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

  -- For crew members: verify job is assigned to their team (team-based only)
  IF v_role = 'crew' THEN
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

GRANT EXECUTE ON FUNCTION public.stop_job_session(uuid) TO authenticated;

-- Note: advance_production_job() and complete_production_job() are NOT updated here
-- because their original definitions were not found in migration history.
-- They will be flagged by the preflight check and handled intentionally later.

-- Update record_payment() RPC - remove assigned_to fallback
CREATE OR REPLACE FUNCTION public.record_payment(
  p_job_id uuid,
  p_amount numeric,
  p_method text,
  p_notes text DEFAULT NULL,
  p_external_ref text DEFAULT NULL,
  p_invoice_id uuid DEFAULT NULL
)
RETURNS TABLE (
  payment_id uuid,
  job_id uuid,
  job_cost numeric,
  total_paid numeric,
  balance_due numeric,
  external_ref text,
  receipt_number text,
  received_by uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
#variable_conflict use_variable
DECLARE
  v_role text;
  v_company_id uuid;
  v_job record;
  v_paid_so_far numeric;
  v_new_total numeric;
  v_allowed numeric;
  v_crew_member_id uuid;
  v_payment_id uuid;
  v_external_ref text;
  v_receipt_number text;
  v_received_by uuid;
  v_invoice record;
  v_invoice_id uuid;
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

  IF v_role NOT IN ('admin','crew') THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  -- Auto-link invoice_id if not provided and invoice exists for this job
  v_invoice_id := p_invoice_id;
  IF v_invoice_id IS NULL THEN
    SELECT i.id
    INTO v_invoice_id
    FROM public.invoices i
    WHERE i.job_id = p_job_id
      AND i.company_id = v_company_id
    LIMIT 1;
  END IF;

  -- If invoice_id is provided (or auto-linked), validate it exists and matches company + job
  IF v_invoice_id IS NOT NULL THEN
    SELECT *
    INTO v_invoice
    FROM public.invoices i
    WHERE i.id = v_invoice_id
      AND i.company_id = v_company_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVOICE_NOT_FOUND';
    END IF;

    -- Validate invoice belongs to the same job
    IF v_invoice.job_id <> p_job_id THEN
      RAISE EXCEPTION 'INVOICE_JOB_MISMATCH';
    END IF;
  END IF;

  -- Lock job row for consistent totals
  SELECT *
  INTO v_job
  FROM public.jobs j
  WHERE j.id = p_job_id
    AND j.company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND';
  END IF;

  -- Crew can only record payments for jobs assigned to their team
  -- Team-based assignment only (assigned_to removed)
  IF v_role = 'crew' THEN
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
  END IF;

  SELECT COALESCE(SUM(pmt.amount), 0)
  INTO v_paid_so_far
  FROM public.payments pmt
  WHERE pmt.job_id = p_job_id
    AND pmt.company_id = v_company_id
    AND pmt.status = 'posted';

  v_new_total := v_paid_so_far + p_amount;
  v_allowed := COALESCE(v_job.job_cost, 0);

  -- Block overpayment (and log attempt)
  IF v_allowed > 0 AND v_new_total > v_allowed THEN
    INSERT INTO public.overpayments_log (job_id, crew_id, entered_amount, allowed_amount, company_id)
    VALUES (
      p_job_id,
      COALESCE(v_crew_member_id, public.current_crew_member_id()),
      p_amount,
      GREATEST(v_allowed - v_paid_so_far, 0),
      v_company_id
    );

    RAISE EXCEPTION 'OVERPAYMENT';
  END IF;

  -- Insert payment with explicit column names matching payments table schema
  INSERT INTO public.payments AS pmt (
    job_id,
    amount,
    payment_method,
    paid,
    date_paid,
    notes,
    company_id,
    paid_at,
    status,
    created_by,
    received_by,
    external_ref,
    invoice_id
  )
  VALUES (
    p_job_id,
    p_amount,
    p_method,
    true,
    CURRENT_DATE,
    p_notes,
    v_company_id,
    now(),
    'posted',
    auth.uid(),
    auth.uid(),
    p_external_ref,
    v_invoice_id
  )
  RETURNING
    pmt.id,
    pmt.external_ref,
    pmt.receipt_number,
    pmt.received_by
  INTO v_payment_id, v_external_ref, v_receipt_number, v_received_by;

  -- Log audit entry (only on successful payment recording)
  BEGIN
    PERFORM public.insert_audit_log(
      p_company_id := v_company_id,
      p_entity_type := 'payment',
      p_entity_id := v_payment_id,
      p_action := 'payment_recorded',
      p_metadata := jsonb_build_object(
        'payment_id', v_payment_id,
        'amount', p_amount,
        'job_id', p_job_id,
        'invoice_id', v_invoice_id
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Log warning but don't fail the operation
    RAISE WARNING 'Failed to log payment audit: %', SQLERRM;
  END;

  payment_id := v_payment_id;
  job_id := p_job_id;
  job_cost := v_allowed;
  total_paid := v_new_total;
  balance_due := GREATEST(v_allowed - v_new_total, 0);
  external_ref := v_external_ref;
  receipt_number := v_receipt_number;
  received_by := v_received_by;

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_payment(uuid, numeric, text, text, text, uuid) TO authenticated;

-- Update crew_add_job_note() RPC - remove assigned_to fallback
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

-- Update crew_flag_job_issue() RPC - remove assigned_to fallback
DROP FUNCTION IF EXISTS public.crew_flag_job_issue(uuid, text, text, text);

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

  -- Insert flag
  INSERT INTO public.job_flags (
    company_id,
    job_id,
    status,
    severity,
    category,
    message
  )
  VALUES (
    v_company_id,
    p_job_id,
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

GRANT EXECUTE ON FUNCTION public.crew_flag_job_issue(uuid, text, text, text) TO authenticated;

-- =============================================================================
-- D) Drop the assigned_to column
-- =============================================================================

ALTER TABLE public.jobs DROP COLUMN IF EXISTS assigned_to;

COMMIT;
