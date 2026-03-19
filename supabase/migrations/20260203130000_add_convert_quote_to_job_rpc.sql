BEGIN;

-- =============================================================================
-- Admin Convert Quote to Job RPC
-- Allows admins to convert an accepted quote to a job
-- - Enforces company scoping via current_company_id()
-- - Idempotent: returns existing job_id if already converted
-- - Creates job with same mapping as public accept flow
-- - Updates quote status and logs activity
-- =============================================================================

-- Create SECURITY DEFINER RPC: convert_quote_to_job_admin
CREATE OR REPLACE FUNCTION public.convert_quote_to_job_admin(p_quote_id uuid)
RETURNS TABLE(quote_id uuid, converted_job_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_company_id uuid;
  v_role text;
  v_quote record;
  v_job_id uuid;
  v_services_text text;
  v_service record;
BEGIN
  -- Require authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Get company_id from current user's profile
  SELECT company_id INTO v_company_id
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'User must be associated with a company';
  END IF;

  -- Get role using current_user_role() helper
  v_role := public.current_user_role();

  -- Only admins and managers can convert quotes
  IF v_role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Load the quote row for p_quote_id AND company_id = current_company_id()
  SELECT q.*
  INTO v_quote
  FROM public.quotes q
  WHERE q.id = p_quote_id
    AND q.company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'quote_not_found';
  END IF;

  -- If quote.converted_job_id is not null, return existing (idempotent)
  IF v_quote.converted_job_id IS NOT NULL THEN
    RETURN QUERY SELECT v_quote.id, v_quote.converted_job_id;
    RETURN;
  END IF;

  -- Build services_performed string from services jsonb
  v_services_text := '';
  IF v_quote.services IS NOT NULL THEN
    FOR v_service IN 
      SELECT * FROM jsonb_array_elements(v_quote.services)
    LOOP
      IF v_services_text != '' THEN
        v_services_text := v_services_text || ', ';
      END IF;
      v_services_text := v_services_text || 
        COALESCE(v_service->>'name', 'Service') || 
        ' (' || COALESCE(v_service->>'qty', '1') || 
        ' x ' || COALESCE(v_service->>'rate', '0') || ')';
    END LOOP;
  END IF;

  -- If no services text was built, use a default
  IF v_services_text = '' THEN
    v_services_text := 'Services from quote';
  END IF;

  -- Insert a job row derived from quote fields
  INSERT INTO public.jobs (
    customer_id,
    company_id,
    job_cost,
    services_performed,
    service_date,
    assigned_team_id,
    status,
    notes
  ) VALUES (
    v_quote.customer_id,
    v_company_id,
    v_quote.total,
    v_services_text,
    NULL,
    NULL,
    'Pending',
    v_quote.notes
  )
  RETURNING id INTO v_job_id;

  -- Update quotes:
  -- - set converted_job_id = new_job_id
  -- - if status != 'accepted' set status = 'accepted'
  -- - set accepted_at = coalesce(accepted_at, now())
  UPDATE public.quotes
  SET converted_job_id = v_job_id,
      status = CASE WHEN status != 'accepted' THEN 'accepted' ELSE status END,
      accepted_at = COALESCE(accepted_at, now())
  WHERE id = v_quote.id;

  -- Log activity
  PERFORM public.log_customer_activity(
    p_customer_id := v_quote.customer_id,
    p_event_type := 'quote.converted_to_job',
    p_event_title := 'Quote converted to job',
    p_event_description := format('Quote #%s converted to job', COALESCE(v_quote.quote_number, v_quote.id::text)),
    p_related_id := v_quote.id,
    p_event_data := jsonb_build_object(
      'quote_id', v_quote.id,
      'job_id', v_job_id,
      'quote_number', v_quote.quote_number,
      'total', v_quote.total
    ),
    p_event_category := 'quotes',
    p_related_type := 'quote',
    p_severity := 'success'
  );

  -- Return (quote_id, converted_job_id)
  RETURN QUERY SELECT v_quote.id, v_job_id;
END;
$$;

-- Permissions: REVOKE ALL on function from public/anon
REVOKE ALL ON FUNCTION public.convert_quote_to_job_admin(uuid) FROM public;
REVOKE ALL ON FUNCTION public.convert_quote_to_job_admin(uuid) FROM anon;

-- GRANT EXECUTE to authenticated only
GRANT EXECUTE ON FUNCTION public.convert_quote_to_job_admin(uuid) TO authenticated;

COMMIT;
