BEGIN;

-- =============================================================================
-- Fix respond_to_quote_public() to match actual jobs table schema
-- Removes non-existent 'title' column and uses correct column names
-- =============================================================================

-- Drop and recreate the function with correct schema
DROP FUNCTION IF EXISTS public.respond_to_quote_public(uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.respond_to_quote_public(
  p_token uuid,
  p_action text,
  p_signer_name text,
  p_comment text
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
BEGIN
  -- Validate action
  IF p_action NOT IN ('accept','reject') THEN
    RAISE EXCEPTION 'Invalid action. Must be "accept" or "reject"';
  END IF;

  -- Look up quote by token (lock row for update)
  SELECT q.*
  INTO v_quote
  FROM public.quotes q
  WHERE q.public_token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote not found';
  END IF;

  -- Check if quote is in valid state for action
  IF v_quote.status != 'sent' THEN
    RAISE EXCEPTION 'Quote has already been %', v_quote.status;
  END IF;

  -- Check if expired
  IF v_quote.valid_until IS NOT NULL AND v_quote.valid_until < CURRENT_DATE THEN
    RAISE EXCEPTION 'Quote expired';
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
    -- Set scheduled_date and scheduled_end_date to CURRENT_DATE as placeholders
    -- Admin can reschedule later
    INSERT INTO public.jobs (
      company_id,
      customer_id,
      scheduled_date,
      scheduled_end_date,
      services_performed,
      job_cost,
      status,
      assigned_team_id,
      labor_pay,
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
      'status', 'rejected'
    );
  END IF;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.respond_to_quote_public(uuid, text, text, text) TO anon, authenticated;

COMMIT;

