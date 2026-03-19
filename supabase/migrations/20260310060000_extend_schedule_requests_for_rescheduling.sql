-- =============================================================================
-- Extend Schedule Requests for Customer Rescheduling
-- =============================================================================
-- Goal:
-- - Reuse public.job_schedule_requests for both initial scheduling and rescheduling
-- - Add customer-authenticated RPC to submit reschedule requests for existing jobs
-- - Keep admin approval/decline workflow unchanged
-- =============================================================================

BEGIN;

-- =============================================================================
-- Part 1: Backwards-compatible schema extension
-- =============================================================================

ALTER TABLE public.job_schedule_requests
ADD COLUMN IF NOT EXISTS request_type text NOT NULL DEFAULT 'initial';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'job_schedule_requests_request_type_check'
  ) THEN
    ALTER TABLE public.job_schedule_requests
      ADD CONSTRAINT job_schedule_requests_request_type_check
      CHECK (request_type IN ('initial', 'reschedule'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_job_schedule_requests_company_status_type
  ON public.job_schedule_requests (company_id, status, request_type, created_at DESC);

-- =============================================================================
-- Part 2: Customer-authenticated reschedule request RPC
-- =============================================================================

CREATE OR REPLACE FUNCTION public.request_job_reschedule(
  p_job_id uuid,
  p_requested_date date,
  p_customer_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid;
  v_customer_id uuid;
  v_company_id uuid;
  v_job record;
  v_existing_request record;
  v_quote_id uuid;
  v_request_id uuid;
BEGIN
  -- 1) Require authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- 2) Resolve customer from auth user
  SELECT c.id, c.company_id
  INTO v_customer_id, v_company_id
  FROM public.customers c
  WHERE c.user_id = v_user_id;

  IF v_customer_id IS NULL OR v_company_id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING
      MESSAGE = 'Only authenticated customers can request a reschedule';
  END IF;

  -- 3) Validate required params
  IF p_job_id IS NULL OR p_requested_date IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_input',
      'reason', 'p_job_id and p_requested_date are required'
    );
  END IF;

  -- 4) Verify ownership + tenant scope + eligible job state
  SELECT
    j.id,
    j.company_id,
    j.customer_id,
    j.service_date,
    COALESCE(j.status, '') AS status
  INTO v_job
  FROM public.jobs j
  WHERE j.id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'not_found',
      'reason', 'Job not found'
    );
  END IF;

  IF v_job.company_id <> v_company_id OR v_job.customer_id <> v_customer_id THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'forbidden',
      'reason', 'You do not have access to this job'
    );
  END IF;

  IF v_job.service_date IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'not_scheduled',
      'reason', 'Only scheduled jobs can be rescheduled'
    );
  END IF;

  IF lower(v_job.status) IN ('completed', 'complete', 'canceled', 'cancelled') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_status',
      'reason', 'Completed or canceled jobs cannot be rescheduled'
    );
  END IF;

  -- 5) One open request per job (idempotent behavior)
  SELECT id, requested_date
  INTO v_existing_request
  FROM public.job_schedule_requests
  WHERE job_id = p_job_id
    AND status = 'requested'
  LIMIT 1;

  IF v_existing_request.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'request_id', v_existing_request.id,
      'requested_date', v_existing_request.requested_date,
      'already_exists', true,
      'reason', 'An open schedule request already exists for this job'
    );
  END IF;

  -- 6) Preserve existing admin workflow: attach quote_id when available
  SELECT q.id
  INTO v_quote_id
  FROM public.quotes q
  WHERE q.company_id = v_company_id
    AND q.converted_job_id = p_job_id
  ORDER BY q.created_at DESC
  LIMIT 1;

  -- 7) Insert pending reschedule request (admin approval required)
  INSERT INTO public.job_schedule_requests (
    company_id,
    job_id,
    quote_id,
    public_token,
    requested_date,
    customer_note,
    status,
    request_type
  ) VALUES (
    v_company_id,
    p_job_id,
    v_quote_id,
    gen_random_uuid(),
    p_requested_date,
    p_customer_note,
    'requested',
    'reschedule'
  )
  RETURNING id INTO v_request_id;

  RETURN jsonb_build_object(
    'ok', true,
    'request_id', v_request_id,
    'requested_date', p_requested_date,
    'request_type', 'reschedule',
    'already_exists', false
  );
EXCEPTION
  WHEN unique_violation THEN
    -- Defensive: align with one-open-request behavior
    SELECT id, requested_date
    INTO v_existing_request
    FROM public.job_schedule_requests
    WHERE job_id = p_job_id
      AND status = 'requested'
    LIMIT 1;

    IF v_existing_request.id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ok', true,
        'request_id', v_existing_request.id,
        'requested_date', v_existing_request.requested_date,
        'already_exists', true,
        'reason', 'An open schedule request already exists for this job'
      );
    END IF;

    RETURN jsonb_build_object(
      'ok', false,
      'error', 'unique_violation',
      'reason', 'Unable to create schedule request - please try again'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_job_reschedule(uuid, date, text) TO authenticated;

COMMIT;
