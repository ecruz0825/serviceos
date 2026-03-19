BEGIN;

-- =============================================================================
-- Add timeline logging to schedule request RPCs (approve and decline)
-- =============================================================================

-- Update approve_job_schedule_request to log customer activity
CREATE OR REPLACE FUNCTION public.approve_job_schedule_request(
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_request record;
  v_user_profile record;
  v_company_id uuid;
  v_quote record;
  v_customer_email text;
  v_company_support_email text;
  v_company_display_name text;
  v_approver_name text;
  v_subject text;
  v_body text;
  v_date_formatted text;
  v_customer_id uuid;
BEGIN
  -- Auth required
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'auth_required',
      'reason', 'Authentication required'
    );
  END IF;

  -- Get user profile
  SELECT p.role, p.company_id, p.full_name
  INTO v_user_profile
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'profile_not_found',
      'reason', 'User profile not found'
    );
  END IF;

  -- Must be admin
  IF v_user_profile.role != 'admin' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'not_authorized',
      'reason', 'Admin role required'
    );
  END IF;

  -- Lock request row for update and get quote/customer/company info
  SELECT 
    jsr.*,
    q.quote_number,
    q.customer_id,
    c.email AS customer_email,
    c.full_name AS customer_name,
    co.support_email AS company_support_email,
    co.display_name AS company_display_name,
    co.name AS company_name
  INTO v_request
  FROM public.job_schedule_requests jsr
  INNER JOIN public.quotes q ON q.id = jsr.quote_id
  INNER JOIN public.customers c ON c.id = q.customer_id
  INNER JOIN public.companies co ON co.id = jsr.company_id
  WHERE jsr.id = p_request_id
  FOR UPDATE;

  -- Check a) Request exists
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'not_found',
      'reason', 'Schedule request not found'
    );
  END IF;

  -- Check b) Same company
  IF v_request.company_id != v_user_profile.company_id THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'not_authorized',
      'reason', 'Request belongs to different company'
    );
  END IF;

  -- Check c) Status is 'requested'
  IF v_request.status != 'requested' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_status',
      'reason', 'Request is not in requested status',
      'current_status', v_request.status
    );
  END IF;

  -- Extract email info
  v_company_id := v_request.company_id;
  v_customer_id := v_request.customer_id;
  v_customer_email := v_request.customer_email;
  v_company_support_email := v_request.company_support_email;
  v_company_display_name := COALESCE(v_request.company_display_name, v_request.company_name, 'ServiceOps');
  v_approver_name := COALESCE(v_user_profile.full_name, 'Admin');

  -- Format date for email
  v_date_formatted := to_char(v_request.requested_date, 'Month DD, YYYY');

  -- Update job: set service_date and scheduled_end_date
  UPDATE public.jobs
  SET 
    service_date = v_request.requested_date,
    scheduled_end_date = v_request.requested_date
  WHERE id = v_request.job_id;

  -- Update request: mark as approved
  UPDATE public.job_schedule_requests
  SET 
    status = 'approved',
    approved_at = now(),
    approved_by = auth.uid()
  WHERE id = p_request_id;

  -- Log schedule request approved activity
  IF v_customer_id IS NOT NULL THEN
    BEGIN
      PERFORM public.log_customer_activity(
        v_customer_id,
        'schedule_request.approved',
        'Schedule request approved',
        'Schedule request approved for ' || v_date_formatted,
        p_request_id,
        jsonb_build_object(
          'request_id', p_request_id,
          'job_id', v_request.job_id,
          'quote_id', v_request.quote_id,
          'requested_date', v_request.requested_date,
          'approved_by', v_approver_name
        ),
        'schedule',
        'schedule_request',
        'success'
      );
    EXCEPTION WHEN OTHERS THEN
      -- Log error but don't fail the transaction
      RAISE WARNING 'Failed to log schedule request approved activity: %', SQLERRM;
    END;
  END IF;

  -- A) Enqueue customer email
  IF v_customer_email IS NOT NULL AND v_customer_email != '' THEN
    v_subject := 'Schedule confirmed – ' || v_request.quote_number;
    v_body := 'Hi ' || COALESCE(v_request.customer_name, 'there') || ',' || E'\n\n' ||
              'Great news! Your schedule request has been confirmed.' || E'\n\n' ||
              'Confirmed Date: ' || v_date_formatted || E'\n\n' ||
              'We look forward to serving you on this date.' || E'\n\n' ||
              'Best regards,' || E'\n' ||
              v_company_display_name;

    INSERT INTO public.quote_messages (
      company_id,
      quote_id,
      to_email,
      subject,
      body,
      status,
      created_by
    ) VALUES (
      v_company_id,
      v_request.quote_id,
      v_customer_email,
      v_subject,
      v_body,
      'queued',
      auth.uid()
    );
  END IF;

  -- B) Enqueue internal email to company_support_email (if exists)
  IF v_company_support_email IS NOT NULL AND v_company_support_email != '' THEN
    v_subject := 'Schedule approved – ' || v_request.quote_number;
    v_body := 'A schedule request has been approved.' || E'\n\n' ||
              'Quote #: ' || v_request.quote_number || E'\n' ||
              'Customer: ' || COALESCE(v_request.customer_name, 'N/A') || E'\n' ||
              'Confirmed Date: ' || v_date_formatted || E'\n' ||
              'Approved by: ' || v_approver_name || E'\n\n' ||
              'The job has been scheduled and the customer has been notified.';

    INSERT INTO public.quote_messages (
      company_id,
      quote_id,
      to_email,
      subject,
      body,
      status,
      created_by
    ) VALUES (
      v_company_id,
      v_request.quote_id,
      v_company_support_email,
      v_subject,
      v_body,
      'queued',
      auth.uid()
    );
  END IF;

  -- Return success
  RETURN jsonb_build_object(
    'ok', true,
    'job_id', v_request.job_id,
    'service_date', v_request.requested_date
  );
END;
$$;

-- Update decline_job_schedule_request to log customer activity
CREATE OR REPLACE FUNCTION public.decline_job_schedule_request(
  p_request_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_request record;
  v_user_profile record;
  v_company_id uuid;
  v_customer_email text;
  v_company_support_email text;
  v_company_display_name text;
  v_decliner_name text;
  v_subject text;
  v_body text;
  v_date_formatted text;
  v_customer_id uuid;
BEGIN
  -- Auth required
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'auth_required',
      'reason', 'Authentication required'
    );
  END IF;

  -- Get user profile
  SELECT p.role, p.company_id, p.full_name
  INTO v_user_profile
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'profile_not_found',
      'reason', 'User profile not found'
    );
  END IF;

  -- Must be admin
  IF v_user_profile.role != 'admin' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'not_authorized',
      'reason', 'Admin role required'
    );
  END IF;

  -- Lock request row for update and get quote/customer/company info
  SELECT 
    jsr.*,
    q.quote_number,
    q.customer_id,
    c.email AS customer_email,
    c.full_name AS customer_name,
    co.support_email AS company_support_email,
    co.display_name AS company_display_name,
    co.name AS company_name
  INTO v_request
  FROM public.job_schedule_requests jsr
  INNER JOIN public.quotes q ON q.id = jsr.quote_id
  INNER JOIN public.customers c ON c.id = q.customer_id
  INNER JOIN public.companies co ON co.id = jsr.company_id
  WHERE jsr.id = p_request_id
  FOR UPDATE;

  -- Check a) Request exists
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'not_found',
      'reason', 'Schedule request not found'
    );
  END IF;

  -- Check b) Same company
  IF v_request.company_id != v_user_profile.company_id THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'not_authorized',
      'reason', 'Request belongs to different company'
    );
  END IF;

  -- Check c) Status is 'requested'
  IF v_request.status != 'requested' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_status',
      'reason', 'Request is not in requested status',
      'current_status', v_request.status
    );
  END IF;

  -- Extract email info
  v_company_id := v_request.company_id;
  v_customer_id := v_request.customer_id;
  v_customer_email := v_request.customer_email;
  v_company_support_email := v_request.company_support_email;
  v_company_display_name := COALESCE(v_request.company_display_name, v_request.company_name, 'ServiceOps');
  v_decliner_name := COALESCE(v_user_profile.full_name, 'Admin');

  -- Format date for email
  v_date_formatted := to_char(v_request.requested_date, 'Month DD, YYYY');

  -- Update request: mark as declined
  UPDATE public.job_schedule_requests
  SET 
    status = 'declined',
    declined_at = now(),
    declined_by = auth.uid(),
    decline_reason = p_reason
  WHERE id = p_request_id;

  -- Log schedule request declined activity
  IF v_customer_id IS NOT NULL THEN
    BEGIN
      PERFORM public.log_customer_activity(
        v_customer_id,
        'schedule_request.declined',
        'Schedule request declined',
        'Schedule request declined for ' || v_date_formatted || COALESCE(': ' || p_reason, ''),
        p_request_id,
        jsonb_build_object(
          'request_id', p_request_id,
          'quote_id', v_request.quote_id,
          'requested_date', v_request.requested_date,
          'declined_by', v_decliner_name,
          'reason', p_reason
        ),
        'schedule',
        'schedule_request',
        'warning'
      );
    EXCEPTION WHEN OTHERS THEN
      -- Log error but don't fail the transaction
      RAISE WARNING 'Failed to log schedule request declined activity: %', SQLERRM;
    END;
  END IF;

  -- A) Enqueue customer email
  IF v_customer_email IS NOT NULL AND v_customer_email != '' THEN
    v_subject := 'Schedule request update – ' || v_request.quote_number;
    v_body := 'Hi ' || COALESCE(v_request.customer_name, 'there') || ',' || E'\n\n' ||
              'We received your schedule request for ' || v_date_formatted || '.' || E'\n\n' ||
              'Unfortunately, we are unable to accommodate this date at this time.' || E'\n\n';
    
    IF p_reason IS NOT NULL AND p_reason != '' THEN
      v_body := v_body || 'Reason: ' || p_reason || E'\n\n';
    END IF;
    
    v_body := v_body || 
              'Please submit a new schedule request with an alternative date, or contact us directly.' || E'\n\n' ||
              'Best regards,' || E'\n' ||
              v_company_display_name;

    INSERT INTO public.quote_messages (
      company_id,
      quote_id,
      to_email,
      subject,
      body,
      status,
      created_by
    ) VALUES (
      v_company_id,
      v_request.quote_id,
      v_customer_email,
      v_subject,
      v_body,
      'queued',
      auth.uid()
    );
  END IF;

  -- B) Enqueue internal email to company_support_email (if exists)
  IF v_company_support_email IS NOT NULL AND v_company_support_email != '' THEN
    v_subject := 'Schedule declined – ' || v_request.quote_number;
    v_body := 'A schedule request has been declined.' || E'\n\n' ||
              'Quote #: ' || v_request.quote_number || E'\n' ||
              'Customer: ' || COALESCE(v_request.customer_name, 'N/A') || E'\n' ||
              'Requested Date: ' || v_date_formatted || E'\n' ||
              'Declined by: ' || v_decliner_name || E'\n';
    
    IF p_reason IS NOT NULL AND p_reason != '' THEN
      v_body := v_body || 'Reason: ' || p_reason || E'\n';
    END IF;
    
    v_body := v_body || E'\n' || 'The customer has been notified.';

    INSERT INTO public.quote_messages (
      company_id,
      quote_id,
      to_email,
      subject,
      body,
      status,
      created_by
    ) VALUES (
      v_company_id,
      v_request.quote_id,
      v_company_support_email,
      v_subject,
      v_body,
      'queued',
      auth.uid()
    );
  END IF;

  -- Return success
  RETURN jsonb_build_object(
    'ok', true,
    'request_id', p_request_id
  );
END;
$$;

COMMIT;
