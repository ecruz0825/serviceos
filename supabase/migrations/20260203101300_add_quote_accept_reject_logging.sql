BEGIN;

-- =============================================================================
-- Add timeline logging to quote accept/reject RPC
-- =============================================================================

-- Update accept_reject_quote_public to log customer activity
CREATE OR REPLACE FUNCTION public.accept_reject_quote_public(
  p_public_token text,
  p_action text,
  p_signer_name text DEFAULT NULL,
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
  v_first_service_name text;
BEGIN
  -- Validate action
  IF p_action NOT IN ('accept','reject') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_action',
      'reason', 'Action must be "accept" or "reject"'
    );
  END IF;

  -- Fetch quote by public_token
  SELECT * INTO v_quote
  FROM public.quotes
  WHERE public_token = p_public_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'quote_not_found',
      'reason', 'Quote not found'
    );
  END IF;

  -- Check a) Quote must be in 'sent' status
  IF v_quote.status != 'sent' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_status',
      'reason', 'Quote must be in "sent" status'
    );
  END IF;

  -- Check b) Quote must not be expired
  IF v_quote.valid_until IS NOT NULL AND v_quote.valid_until < CURRENT_TIMESTAMP THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'quote_expired',
      'reason', 'Quote has expired'
    );
  END IF;

  -- Check c) Idempotency: if already accepted/rejected, return existing state
  IF v_quote.status IN ('accepted', 'rejected') THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', v_quote.status,
      'job_id', v_quote.converted_job_id,
      'reason', 'Quote already ' || v_quote.status || ' (idempotent)'
    );
  ELSIF v_quote.accepted_at IS NOT NULL OR v_quote.rejected_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', CASE WHEN v_quote.accepted_at IS NOT NULL THEN 'accepted' ELSE 'rejected' END,
      'job_id', v_quote.converted_job_id,
      'reason', 'Quote already processed (idempotent)'
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

    -- Log quote accepted activity
    BEGIN
      PERFORM public.log_customer_activity(
        v_quote.customer_id,
        'quote.accepted',
        'Quote accepted',
        'Quote #' || v_quote.quote_number || ' accepted by customer',
        v_quote.id,
        jsonb_build_object(
          'quote_id', v_quote.id,
          'job_id', v_job_id,
          'status', 'accepted',
          'total', v_quote.total,
          'accepted_by', p_signer_name
        ),
        'quotes',
        'quote',
        'success'
      );
    EXCEPTION WHEN OTHERS THEN
      -- Log error but don't fail the transaction
      RAISE WARNING 'Failed to log quote accepted activity: %', SQLERRM;
    END;

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

    -- Log quote rejected activity
    BEGIN
      PERFORM public.log_customer_activity(
        v_quote.customer_id,
        'quote.rejected',
        'Quote rejected',
        'Quote #' || v_quote.quote_number || ' rejected by customer',
        v_quote.id,
        jsonb_build_object(
          'quote_id', v_quote.id,
          'status', 'rejected',
          'total', v_quote.total,
          'rejected_by', p_signer_name,
          'comment', p_comment
        ),
        'quotes',
        'quote',
        'warning'
      );
    EXCEPTION WHEN OTHERS THEN
      -- Log error but don't fail the transaction
      RAISE WARNING 'Failed to log quote rejected activity: %', SQLERRM;
    END;

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
    'reason', 'An unexpected error occurred'
  );
END;
$$;

COMMIT;
