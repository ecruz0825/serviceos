BEGIN;

-- =============================================================================
-- Add Email Notifications for Job Schedule Requests
-- Enqueues emails to quote_messages queue for customer and internal notifications
-- =============================================================================

-- 1) Update request_job_schedule_public to enqueue emails
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
  v_existing_request uuid;
  v_request_id uuid;
  v_customer record;
  v_company record;
  v_customer_email text;
  v_company_support_email text;
  v_company_display_name text;
  v_subject text;
  v_body text;
  v_date_formatted text;
BEGIN
  -- Lookup quote by public_token with customer and company info
  SELECT 
    q.*,
    c.email AS customer_email,
    c.full_name AS customer_name,
    co.support_email AS company_support_email,
    co.display_name AS company_display_name,
    co.name AS company_name
  INTO v_quote
  FROM public.quotes q
  INNER JOIN public.customers c ON c.id = q.customer_id
  INNER JOIN public.companies co ON co.id = q.company_id
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

  -- Extract IDs and email info
  v_company_id := v_quote.company_id;
  v_job_id := v_quote.converted_job_id;
  v_quote_id := v_quote.id;
  v_customer_email := v_quote.customer_email;
  v_company_support_email := v_quote.company_support_email;
  v_company_display_name := COALESCE(v_quote.company_display_name, v_quote.company_name, 'ServiceOps');

  -- Check d) Customer email exists
  IF v_customer_email IS NULL OR v_customer_email = '' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'missing_customer_email',
      'reason', 'Customer email not found'
    );
  END IF;

  -- Check e) Idempotency/rate limit: existing request within 24 hours
  SELECT id INTO v_existing_request
  FROM public.job_schedule_requests
  WHERE job_id = v_job_id
    AND status = 'requested'
    AND requested_date = p_requested_date
    AND created_at > now() - interval '24 hours'
  LIMIT 1;

  IF v_existing_request IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reason', 'already_requested',
      'requested_date', p_requested_date,
      'request_id', v_existing_request
    );
  END IF;

  -- Format date for email
  v_date_formatted := to_char(p_requested_date, 'Month DD, YYYY');

  -- Insert new request
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
    gen_random_uuid(),
    p_requested_date,
    p_customer_note,
    'requested'
  )
  RETURNING id INTO v_request_id;

  -- A) Enqueue customer email
  v_subject := 'Schedule request received – ' || v_quote.quote_number;
  v_body := 'Hi ' || COALESCE(v_quote.customer_name, 'there') || ',' || E'\n\n' ||
            'Thank you for your schedule request.' || E'\n\n' ||
            'Requested Date: ' || v_date_formatted || E'\n\n' ||
            'We''ll confirm your schedule soon.' || E'\n\n' ||
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
    v_quote_id,
    v_customer_email,
    v_subject,
    v_body,
    'queued',
    NULL  -- Public request, no user
  );

  -- B) Enqueue internal email to company_support_email (if exists)
  IF v_company_support_email IS NOT NULL AND v_company_support_email != '' THEN
    v_subject := 'New schedule request – ' || v_quote.quote_number;
    v_body := 'A new schedule request has been received.' || E'\n\n' ||
              'Quote #: ' || v_quote.quote_number || E'\n' ||
              'Customer: ' || COALESCE(v_quote.customer_name, 'N/A') || E'\n' ||
              'Customer Email: ' || v_customer_email || E'\n' ||
              'Requested Date: ' || v_date_formatted || E'\n';
    
    IF p_customer_note IS NOT NULL AND p_customer_note != '' THEN
      v_body := v_body || 'Customer Note: ' || p_customer_note || E'\n';
    END IF;
    
    v_body := v_body || E'\n' ||
              'Please review and approve or decline the request in the admin panel.';

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
      v_quote_id,
      v_company_support_email,
      v_subject,
      v_body,
      'queued',
      NULL  -- Public request, no user
    );
  END IF;

  -- Return success
  RETURN jsonb_build_object(
    'ok', true,
    'request_id', v_request_id,
    'requested_date', p_requested_date
  );
END;
$$;

-- 2) Update approve_job_schedule_request to enqueue emails
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

-- 3) Update decline_job_schedule_request to enqueue emails
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
    decline_reason = p_reason
  WHERE id = p_request_id;

  -- A) Enqueue customer email
  IF v_customer_email IS NOT NULL AND v_customer_email != '' THEN
    v_subject := 'Schedule request update – ' || v_request.quote_number;
    v_body := 'Hi ' || COALESCE(v_request.customer_name, 'there') || ',' || E'\n\n' ||
              'We regret to inform you that your schedule request for ' || v_date_formatted || 
              ' could not be approved at this time.';
    
    IF p_reason IS NOT NULL AND p_reason != '' THEN
      v_body := v_body || E'\n\n' || 'Reason: ' || p_reason;
    END IF;
    
    v_body := v_body || E'\n\n' ||
              'Please contact us to discuss alternative dates.' || E'\n\n' ||
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
              'Declined by: ' || v_decliner_name;
    
    IF p_reason IS NOT NULL AND p_reason != '' THEN
      v_body := v_body || E'\n' || 'Reason: ' || p_reason;
    END IF;

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
    'request_id', p_request_id,
    'status', 'declined'
  );
END;
$$;

COMMIT;

