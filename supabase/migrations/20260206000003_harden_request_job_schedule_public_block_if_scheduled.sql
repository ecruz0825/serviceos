BEGIN;

-- =============================================================================
-- Harden request_job_schedule_public: Block requests on already-scheduled jobs
-- Prevents customers from submitting schedule requests for jobs that already
-- have a service_date set. This ensures schedule requests are only valid for
-- jobs in the "Needs Scheduling" state.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.request_job_schedule_public(
  p_token uuid,
  p_requested_date date,
  p_customer_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_quote record;
  v_company_id uuid;
  v_job_id uuid;
  v_quote_id uuid;
  v_existing_request record;
  v_request_id uuid;
  v_job_service_date date;
BEGIN
  -- Lookup quote by public_token
  SELECT q.*
  INTO v_quote
  FROM public.quotes q
  WHERE q.public_token = p_token
  FOR UPDATE;

  -- Check a) Quote exists
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'not_found',
      'reason', 'Quote not found'
    );
  END IF;

  -- Check b) Quote status is 'accepted'
  IF v_quote.status != 'accepted' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_status',
      'reason', 'Quote must be accepted before scheduling'
    );
  END IF;

  -- Check c) Quote has converted_job_id
  IF v_quote.converted_job_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'no_job',
      'reason', 'Job not yet created from quote'
    );
  END IF;

  -- Extract IDs
  v_company_id := v_quote.company_id;
  v_job_id := v_quote.converted_job_id;
  v_quote_id := v_quote.id;

  -- Check d) Verify job exists and is not already scheduled
  SELECT service_date INTO v_job_service_date
  FROM public.jobs
  WHERE id = v_job_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'job_not_found',
      'reason', 'Job not found'
    );
  END IF;
  
  -- If job already has service_date set, reject the request
  IF v_job_service_date IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'job_already_scheduled',
      'reason', 'This job is already scheduled and cannot accept new schedule requests'
    );
  END IF;

  -- Check e) Check if an open request already exists for this job
  -- This is the key check: only ONE open request per job allowed
  -- (idempotency behavior preserved)
  SELECT id, requested_date, customer_note, created_at
  INTO v_existing_request
  FROM public.job_schedule_requests
  WHERE job_id = v_job_id
    AND status = 'requested'
  LIMIT 1;

  -- If open request exists, return idempotent success
  IF v_existing_request.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'request_id', v_existing_request.id,
      'requested_date', v_existing_request.requested_date,
      'already_exists', true,
      'reason', 'An open schedule request already exists for this job'
    );
  END IF;

  -- No open request exists - insert new one
  INSERT INTO public.job_schedule_requests (
    company_id,
    job_id,
    quote_id,
    public_token,
    requested_date,
    customer_note,
    status
  ) VALUES (
    v_company_id,
    v_job_id,
    v_quote_id,
    p_token,
    p_requested_date,
    p_customer_note,
    'requested'
  )
  RETURNING id INTO v_request_id;

  -- Return success
  RETURN jsonb_build_object(
    'ok', true,
    'request_id', v_request_id,
    'requested_date', p_requested_date,
    'already_exists', false
  );
EXCEPTION
  WHEN unique_violation THEN
    -- Catch unique index violation (defensive - should not happen due to check above)
    -- Return existing request if we can find it
    SELECT id, requested_date INTO v_existing_request
    FROM public.job_schedule_requests
    WHERE job_id = v_job_id
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
    ELSE
      -- Should not reach here, but handle gracefully
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'unique_violation',
        'reason', 'Unable to create schedule request - please try again'
      );
    END IF;
END;
$$;

-- Grant execute permissions (preserve existing)
GRANT EXECUTE ON FUNCTION public.request_job_schedule_public(uuid, date, text) TO anon, authenticated;

COMMIT;
