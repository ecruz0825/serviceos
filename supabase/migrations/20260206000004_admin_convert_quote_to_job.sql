BEGIN;

-- =============================================================================
-- Admin Convert Quote to Job RPC
-- Allows admins/managers to convert a quote to a job, matching the public
-- acceptance conversion behavior. Returns JSONB with status and job_id.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_convert_quote_to_job(p_quote_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_role text;
  v_quote record;
  v_job_id uuid;
  v_job_notes text;
BEGIN
  -- 1) Determine caller user id
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'AUTH_REQUIRED',
      'message', 'Authentication required'
    );
  END IF;

  -- 2) Read caller profile: company_id + role from public.profiles
  SELECT p.company_id, p.role INTO v_company_id, v_role
  FROM public.profiles p
  WHERE p.id = v_user_id;

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'NO_COMPANY',
      'message', 'User must be associated with a company'
    );
  END IF;

  -- Roles allowed: admin, manager (include dispatcher if exists, otherwise only admin/manager)
  -- Check if dispatcher role exists in the system by checking profiles
  IF v_role NOT IN ('admin', 'manager', 'dispatcher') THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'FORBIDDEN',
      'message', 'Only admins, managers, and dispatchers can convert quotes to jobs'
    );
  END IF;

  -- 3) Load quote by id and ensure quote.company_id = profile.company_id
  SELECT q.*
  INTO v_quote
  FROM public.quotes q
  WHERE q.id = p_quote_id
    AND q.company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'QUOTE_NOT_FOUND',
      'message', 'Quote not found or access denied'
    );
  END IF;

  -- 4) If quote.converted_job_id is not null, return idempotent response
  IF v_quote.converted_job_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'job_already_created',
      'job_id', v_quote.converted_job_id
    );
  END IF;

  -- 5) Convert quote to job using the SAME logic as public acceptance
  -- Build job notes from quote info (matching public acceptance format)
  v_job_notes := 'Quote converted to job by admin.' || E'\n';
  v_job_notes := v_job_notes || 'Quote Number: ' || v_quote.quote_number || E'\n';
  v_job_notes := v_job_notes || 'Converted by: Admin' || E'\n';
  IF v_quote.notes IS NOT NULL AND v_quote.notes != '' THEN
    v_job_notes := v_job_notes || E'\n' || 'Quote notes: ' || v_quote.notes;
  END IF;

  -- Create job from quote (matching public acceptance logic)
  -- Set service_date and scheduled_end_date to NULL so job lands in Needs Scheduling
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
    NULL,
    NULL,
    'From Quote ' || v_quote.quote_number,
    COALESCE(v_quote.total, 0),
    'Pending',
    NULL,
    v_job_notes
  )
  RETURNING id INTO v_job_id;

  -- Update quote: set converted_job_id, status='accepted' if not already, accepted_at if not set
  UPDATE public.quotes
  SET converted_job_id = v_job_id,
      status = CASE WHEN status != 'accepted' THEN 'accepted' ELSE status END,
      accepted_at = COALESCE(accepted_at, now()),
      accepted_by_name = COALESCE(accepted_by_name, 'Admin')
  WHERE id = v_quote.id;

  -- Return success with created status
  RETURN jsonb_build_object(
    'status', 'created',
    'job_id', v_job_id
  );
END;
$$;

-- Grant execute to authenticated users (RLS and role checks enforced inside function)
GRANT EXECUTE ON FUNCTION public.admin_convert_quote_to_job(uuid) TO authenticated;

COMMIT;
