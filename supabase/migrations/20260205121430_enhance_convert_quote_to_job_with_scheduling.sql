BEGIN;

-- =============================================================================
-- Enhance convert_quote_to_job_admin RPC with Optional Scheduling & Team Assignment
-- Adds optional parameters for service_date, scheduled_end_date, and assigned_team_id
-- - Maintains backward compatibility (all parameters optional with DEFAULT NULL)
-- - Preserves idempotency and security checks
-- - Adds date validation (scheduled_end_date >= service_date)
-- =============================================================================

-- Drop old function signature to replace with enhanced version
DROP FUNCTION IF EXISTS public.convert_quote_to_job_admin(uuid);

-- Create enhanced function with optional scheduling/team parameters
CREATE OR REPLACE FUNCTION public.convert_quote_to_job_admin(
  p_quote_id uuid,
  p_service_date date DEFAULT NULL,
  p_scheduled_end_date date DEFAULT NULL,
  p_assigned_team_id uuid DEFAULT NULL
)
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

  -- Validate date ordering: if both dates provided, scheduled_end_date must be >= service_date
  IF p_service_date IS NOT NULL AND p_scheduled_end_date IS NOT NULL THEN
    IF p_scheduled_end_date < p_service_date THEN
      RAISE EXCEPTION 'scheduled_end_date must be greater than or equal to service_date';
    END IF;
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

  -- Insert a job row derived from quote fields with optional scheduling/team assignment
  INSERT INTO public.jobs (
    customer_id,
    company_id,
    job_cost,
    services_performed,
    service_date,
    scheduled_end_date,
    assigned_team_id,
    status,
    notes
  ) VALUES (
    v_quote.customer_id,
    v_company_id,
    v_quote.total,
    v_services_text,
    p_service_date,              -- Use provided service_date (or NULL)
    p_scheduled_end_date,         -- Use provided scheduled_end_date (or NULL)
    p_assigned_team_id,            -- Use provided assigned_team_id (or NULL)
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
      'total', v_quote.total,
      'service_date', p_service_date,
      'scheduled_end_date', p_scheduled_end_date,
      'assigned_team_id', p_assigned_team_id
    ),
    p_event_category := 'quotes',
    p_related_type := 'quote',
    p_severity := 'success'
  );

  -- Return (quote_id, converted_job_id)
  RETURN QUERY SELECT v_quote.id, v_job_id;
END;
$$;

-- Revoke all permissions from public/anon (security)
REVOKE ALL ON FUNCTION public.convert_quote_to_job_admin(uuid, date, date, uuid) FROM public;
REVOKE ALL ON FUNCTION public.convert_quote_to_job_admin(uuid, date, date, uuid) FROM anon;

-- Grant execute to authenticated users (RLS and role checks enforced inside function)
GRANT EXECUTE ON FUNCTION public.convert_quote_to_job_admin(uuid, date, date, uuid) TO authenticated;

COMMIT;
