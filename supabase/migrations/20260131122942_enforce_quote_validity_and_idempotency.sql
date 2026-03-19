BEGIN;

-- =============================================================================
-- Enforce Quote Validity and Idempotency in respond_to_quote_public()
-- Prevents: expired quotes, duplicate responses, duplicate jobs
-- Adds: server-side validation, idempotent accept, JSON error responses
-- =============================================================================

CREATE OR REPLACE FUNCTION public.respond_to_quote_public(
  p_token uuid,
  p_action text,
  p_signer_name text,
  p_comment text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_quote record;
  v_job_id uuid;
  v_job_notes text;
  v_is_expired boolean;
  v_already_responded boolean;
BEGIN
  -- Validate action
  IF p_action NOT IN ('accept','reject') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_action',
      'reason', 'Action must be "accept" or "reject"'
    );
  END IF;

  -- Lock quote row for update (concurrency safety)
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

  -- Check b) Quote is not expired
  -- Prefer expires_at (timestamptz), fallback to valid_until (date) for backwards compatibility
  v_is_expired := false;
  IF v_quote.expires_at IS NOT NULL THEN
    v_is_expired := now() > v_quote.expires_at;
  ELSIF v_quote.valid_until IS NOT NULL THEN
    v_is_expired := CURRENT_DATE > v_quote.valid_until;
  END IF;

  IF v_is_expired THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'expired',
      'reason', 'Quote has expired'
    );
  END IF;

  -- Check c) Quote has not already been responded to
  -- Check status enum OR timestamp columns (defensive)
  v_already_responded := false;
  IF v_quote.status IN ('accepted', 'rejected') THEN
    v_already_responded := true;
  ELSIF v_quote.accepted_at IS NOT NULL OR v_quote.rejected_at IS NOT NULL THEN
    v_already_responded := true;
  END IF;

  IF v_already_responded THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'already_responded',
      'reason', 'Quote has already been ' || COALESCE(v_quote.status, 'responded to'),
      'status', v_quote.status,
      'job_id', v_quote.converted_job_id
    );
  END IF;

  -- Check d) Idempotency for accept: if converted_job_id exists, return it
  IF p_action = 'accept' AND v_quote.converted_job_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'accepted',
      'job_id', v_quote.converted_job_id,
      'reason', 'Quote already accepted (idempotent)'
    );
  END IF;

  -- Process accept action
  IF p_action = 'accept' THEN
    -- Build job notes from quote info
    v_job_notes := 'Quote accepted via public link.' || E'\n';
    v_job_notes := v_job_notes || 'Quote Number: ' || v_quote.quote_number || E'\n';
    IF p_signer_name IS NOT NULL AND p_signer_name != '' THEN
      v_job_notes := v_job_notes || 'Accepted by: ' || p_signer_name || E'\n';
    END IF;
    IF p_comment IS NOT NULL AND p_comment != '' THEN
      v_job_notes := v_job_notes || 'Customer comment: ' || p_comment || E'\n';
    END IF;
    IF v_quote.notes IS NOT NULL AND v_quote.notes != '' THEN
      v_job_notes := v_job_notes || E'\n' || 'Quote notes: ' || v_quote.notes;
    END IF;

    -- Create job from quote
    INSERT INTO public.jobs (
      company_id,
      customer_id,
      service_date,
      scheduled_end_date,
      services_performed,
      job_cost,
      status,
      assigned_team_id,
      notes
    ) VALUES (
      v_quote.company_id,
      v_quote.customer_id,
      CURRENT_DATE,
      CURRENT_DATE,
      'From Quote ' || v_quote.quote_number,
      COALESCE(v_quote.total, 0),
      'Pending',
      NULL,
      v_job_notes
    )
    RETURNING id INTO v_job_id;

    -- Update quote: status='accepted', accepted_at=now(), accepted_by_name, customer_comment, converted_job_id
    UPDATE public.quotes
    SET status = 'accepted',
        accepted_at = now(),
        accepted_by_name = p_signer_name,
        customer_comment = p_comment,
        converted_job_id = v_job_id
    WHERE id = v_quote.id;

    -- Return success
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'accepted',
      'job_id', v_job_id
    );

  -- Process reject action
  ELSIF p_action = 'reject' THEN
    -- Update quote: status='rejected', rejected_at=now(), rejected_by_name, customer_comment
    UPDATE public.quotes
    SET status = 'rejected',
        rejected_at = now(),
        rejected_by_name = p_signer_name,
        customer_comment = p_comment
    WHERE id = v_quote.id;

    -- Return success
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'rejected',
      'job_id', NULL
    );
  END IF;

  -- Should never reach here, but return error if we do
  RETURN jsonb_build_object(
    'ok', false,
    'error', 'unexpected_error',
    'reason', 'Unexpected error processing quote response'
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.respond_to_quote_public(uuid, text, text, text) TO anon, authenticated;

COMMIT;

