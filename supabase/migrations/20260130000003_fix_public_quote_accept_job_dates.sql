BEGIN;

-- =============================================================================
-- Fix respond_to_quote_public() to handle NOT NULL scheduling fields
-- Sets service_date and scheduled_end_date to CURRENT_DATE as placeholders
-- =============================================================================

-- Drop and recreate the function with proper date handling
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
  v_services_text text;
  v_service_json jsonb;
  v_service_name text;
  v_service_qty text;
  v_service_rate text;
  v_job_title text;
  v_job_details text;
  v_first_service_name text;
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
    -- Build services_performed string from services jsonb
    -- Safely cast to jsonb if it's json
    v_services_text := '';
    v_first_service_name := '';
    
    IF v_quote.services IS NOT NULL THEN
      -- Cast to jsonb to handle both json and jsonb types
      FOR v_service_json IN 
        SELECT value::jsonb FROM jsonb_array_elements(v_quote.services::jsonb)
      LOOP
        -- Extract fields from jsonb value
        v_service_name := COALESCE(v_service_json->>'name', 'Service');
        v_service_qty := COALESCE(v_service_json->>'qty', '1');
        v_service_rate := COALESCE(v_service_json->>'rate', '0');
        
        -- Capture first service name for title
        IF v_first_service_name = '' THEN
          v_first_service_name := v_service_name;
        END IF;
        
        IF v_services_text != '' THEN
          v_services_text := v_services_text || ', ';
        END IF;
        v_services_text := v_services_text || 
          v_service_name || 
          ' (' || v_service_qty || 
          ' x ' || v_service_rate || ')';
      END LOOP;
    END IF;
    
    -- If no services, use default
    IF v_services_text = '' THEN
      v_services_text := 'Services from quote';
      v_first_service_name := 'Service';
    END IF;

    -- Build job title: "Accepted Quote Q-0001" or use first service name
    IF v_first_service_name != '' AND v_first_service_name != 'Service' THEN
      v_job_title := 'Accepted Quote ' || v_quote.quote_number || ' - ' || v_first_service_name;
    ELSE
      v_job_title := 'Accepted Quote ' || v_quote.quote_number;
    END IF;

    -- Build job details/notes from quote info
    v_job_details := 'Quote accepted via public link.' || E'\n';
    v_job_details := v_job_details || 'Quote Number: ' || v_quote.quote_number || E'\n';
    IF p_signer_name IS NOT NULL AND p_signer_name != '' THEN
      v_job_details := v_job_details || 'Accepted by: ' || p_signer_name || E'\n';
    END IF;
    IF p_comment IS NOT NULL AND p_comment != '' THEN
      v_job_details := v_job_details || 'Customer comment: ' || p_comment || E'\n';
    END IF;
    IF v_quote.notes IS NOT NULL AND v_quote.notes != '' THEN
      v_job_details := v_job_details || E'\n' || 'Quote notes: ' || v_quote.notes;
    END IF;

    -- Create job from quote
    -- Set service_date and scheduled_end_date to CURRENT_DATE as placeholders
    -- Admin can reschedule later
    INSERT INTO public.jobs (
      company_id,
      customer_id,
      service_date,
      scheduled_end_date,
      services_performed,
      job_cost,
      status,
      title,
      notes
    ) VALUES (
      v_quote.company_id,
      v_quote.customer_id,
      CURRENT_DATE,
      CURRENT_DATE,
      v_services_text,
      COALESCE(v_quote.total, 0),
      'Pending',
      v_job_title,
      v_job_details
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

