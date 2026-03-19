BEGIN;

-- =============================================================================
-- Fix respond_to_quote_public() RPC function
-- Fixes: "operator does not exist: record ->> unknown" error
-- =============================================================================

-- Drop and recreate the function with proper JSONB handling
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
    
    IF v_quote.services IS NOT NULL THEN
      -- Cast to jsonb to handle both json and jsonb types
      FOR v_service_json IN 
        SELECT value::jsonb FROM jsonb_array_elements(v_quote.services::jsonb)
      LOOP
        -- Extract fields from jsonb value
        v_service_name := COALESCE(v_service_json->>'name', 'Service');
        v_service_qty := COALESCE(v_service_json->>'qty', '1');
        v_service_rate := COALESCE(v_service_json->>'rate', '0');
        
        IF v_services_text != '' THEN
          v_services_text := v_services_text || ', ';
        END IF;
        v_services_text := v_services_text || 
          v_service_name || 
          ' (' || v_service_qty || 
          ' x ' || v_service_rate || ')';
      END LOOP;
    END IF;
    
    -- If no services or empty, use empty string
    IF v_services_text = '' THEN
      v_services_text := '';
    END IF;

    -- Create job from quote
    -- Use service_date (set to NULL) - this is the actual column name in the jobs table
    INSERT INTO public.jobs (
      company_id,
      customer_id,
      service_date,
      services_performed,
      job_cost,
      status
    ) VALUES (
      v_quote.company_id,
      v_quote.customer_id,
      NULL,
      v_services_text,
      COALESCE(v_quote.total, 0),
      'Pending'
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

