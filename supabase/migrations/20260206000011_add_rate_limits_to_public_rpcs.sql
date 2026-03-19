BEGIN;

-- =============================================================================
-- Add Rate Limiting to Public RPCs
-- Protects public endpoints from abuse with burst and hourly limits
-- =============================================================================

-- 1) Update get_quote_public to add rate limiting
CREATE OR REPLACE FUNCTION public.get_quote_public(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_quote record;
  v_result jsonb;
  v_rate_limit_key text;
BEGIN
  -- Rate limiting: quote viewed
  -- Build stable key from token
  v_rate_limit_key := 'quote_token:' || p_token::text;
  
  -- Check burst limit: 10 per minute
  BEGIN
    PERFORM public.check_rate_limit(v_rate_limit_key, 'quote_viewed', 10, 60);
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'P0001' AND SQLERRM LIKE '%rate_limit_exceeded%' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'rate_limit_exceeded',
        'reason', 'Too many requests - please wait a moment and try again'
      );
    ELSE
      RAISE;
    END IF;
  END;
  
  -- Check hourly limit: 120 per hour
  BEGIN
    PERFORM public.check_rate_limit(v_rate_limit_key, 'quote_viewed', 120, 3600);
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'P0001' AND SQLERRM LIKE '%rate_limit_exceeded%' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'rate_limit_exceeded',
        'reason', 'Too many requests - please wait a bit and try again'
      );
    ELSE
      RAISE;
    END IF;
  END;

  -- Look up quote by public_token with customer and company info
  SELECT 
    q.id,
    q.public_token,
    q.quote_number,
    q.services,
    q.subtotal,
    q.tax,
    q.total,
    q.status,
    q.valid_until,
    q.expires_at,
    q.notes,
    q.created_at,
    q.updated_at,
    q.sent_at,
    q.accepted_at,
    q.rejected_at,
    q.accepted_by_name,
    q.rejected_by_name,
    q.customer_comment,
    q.converted_job_id,
    q.last_viewed_at,
    c.full_name AS customer_full_name,
    c.email AS customer_email,
    co.display_name AS company_display_name,
    co.name AS company_name,
    co.address AS company_address,
    co.support_phone AS company_support_phone,
    co.support_email AS company_support_email,
    co.logo_path AS company_logo_path,
    co.logo_url AS company_logo_url
  INTO v_quote
  FROM public.quotes q
  INNER JOIN public.customers c ON c.id = q.customer_id
  INNER JOIN public.companies co ON co.id = q.company_id
  WHERE q.public_token = p_token
  LIMIT 1;

  -- If not found, return error response
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'not_found'
    );
  END IF;

  -- Only allow viewing if status is in ('sent','accepted','rejected','expired')
  IF v_quote.status NOT IN ('sent','accepted','rejected','expired') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'not_found'
    );
  END IF;

  -- Build and return success response with all quote data
  RETURN jsonb_build_object(
    'ok', true,
    'quote', jsonb_build_object(
      -- Core quote fields
      'id', v_quote.id,
      'public_token', v_quote.public_token,
      'quote_number', v_quote.quote_number,
      'status', v_quote.status::text,
      'services', v_quote.services,
      'subtotal', v_quote.subtotal,
      'tax', v_quote.tax,
      'total', v_quote.total,
      'notes', v_quote.notes,
      
      -- Timestamps
      'created_at', v_quote.created_at,
      'updated_at', v_quote.updated_at,
      'sent_at', v_quote.sent_at,
      'accepted_at', v_quote.accepted_at,
      'rejected_at', v_quote.rejected_at,
      'last_viewed_at', v_quote.last_viewed_at,
      
      -- Expiration fields
      'valid_until', v_quote.valid_until,
      'expires_at', v_quote.expires_at,
      
      -- Response fields
      'accepted_by_name', v_quote.accepted_by_name,
      'rejected_by_name', v_quote.rejected_by_name,
      'customer_comment', v_quote.customer_comment,
      
      -- Job linkage
      'converted_job_id', v_quote.converted_job_id,
      
      -- Customer info
      'customer_full_name', v_quote.customer_full_name,
      'customer_email', v_quote.customer_email,
      
      -- Company info
      'company_display_name', v_quote.company_display_name,
      'company_name', v_quote.company_name,
      'company_address', v_quote.company_address,
      'company_support_phone', v_quote.company_support_phone,
      'company_support_email', v_quote.company_support_email,
      'company_logo_path', v_quote.company_logo_path,
      'company_logo_url', v_quote.company_logo_url
    )
  );
END;
$$;

-- 2) Update mark_quote_viewed_public to add rate limiting
CREATE OR REPLACE FUNCTION public.mark_quote_viewed_public(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_quote_id uuid;
  v_last_viewed timestamptz;
  v_rate_limit_key text;
BEGIN
  -- Rate limiting: quote viewed
  -- Build stable key from token
  v_rate_limit_key := 'quote_token:' || p_token::text;
  
  -- Check burst limit: 10 per minute
  BEGIN
    PERFORM public.check_rate_limit(v_rate_limit_key, 'quote_viewed', 10, 60);
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'P0001' AND SQLERRM LIKE '%rate_limit_exceeded%' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'rate_limit_exceeded',
        'reason', 'Too many requests - please wait a moment and try again'
      );
    ELSE
      RAISE;
    END IF;
  END;
  
  -- Check hourly limit: 120 per hour
  BEGIN
    PERFORM public.check_rate_limit(v_rate_limit_key, 'quote_viewed', 120, 3600);
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'P0001' AND SQLERRM LIKE '%rate_limit_exceeded%' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'rate_limit_exceeded',
        'reason', 'Too many requests - please wait a bit and try again'
      );
    ELSE
      RAISE;
    END IF;
  END;

  -- Find quote by public_token
  SELECT q.id, q.last_viewed_at
  INTO v_quote_id, v_last_viewed
  FROM public.quotes q
  WHERE q.public_token = p_token
  LIMIT 1;

  -- If not found, return error
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'not_found'
    );
  END IF;

  -- Update last_viewed_at only if:
  -- - last_viewed_at is null, OR
  -- - last_viewed_at is older than 15 minutes (prevents spam on refresh)
  IF v_last_viewed IS NULL OR v_last_viewed < now() - interval '15 minutes' THEN
    UPDATE public.quotes
    SET last_viewed_at = now()
    WHERE id = v_quote_id;
  END IF;

  -- Return success
  RETURN jsonb_build_object(
    'ok', true
  );
END;
$$;

-- 3) Update respond_to_quote_public to add rate limiting
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
  v_rate_limit_key text;
BEGIN
  -- Rate limiting: quote respond/accept/reject
  -- Build stable key from token
  v_rate_limit_key := 'quote_token:' || p_token::text;
  
  -- Check burst limit: 5 per minute
  BEGIN
    PERFORM public.check_rate_limit(v_rate_limit_key, 'quote_respond', 5, 60);
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'P0001' AND SQLERRM LIKE '%rate_limit_exceeded%' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'rate_limit_exceeded',
        'reason', 'Too many attempts - please wait a moment and try again'
      );
    ELSE
      RAISE;
    END IF;
  END;
  
  -- Check hourly limit: 20 per hour
  BEGIN
    PERFORM public.check_rate_limit(v_rate_limit_key, 'quote_respond', 20, 3600);
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'P0001' AND SQLERRM LIKE '%rate_limit_exceeded%' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'rate_limit_exceeded',
        'reason', 'Too many attempts - please wait a bit and try again'
      );
    ELSE
      RAISE;
    END IF;
  END;

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

  -- Check d) Idempotency for accept: if converted_job_id exists, return it (no logging on idempotent)
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

    -- Update quote: status='accepted', accepted_at=now(), accepted_by_name, customer_comment, converted_job_id
    UPDATE public.quotes
    SET status = 'accepted',
        accepted_at = now(),
        accepted_by_name = p_signer_name,
        customer_comment = p_comment,
        converted_job_id = v_job_id
    WHERE id = v_quote.id;

    -- Log audit entry (only on successful acceptance)
    BEGIN
      PERFORM public.insert_audit_log(
        p_company_id := v_quote.company_id,
        p_entity_type := 'quote',
        p_entity_id := v_quote.id,
        p_action := 'quote_accepted',
        p_metadata := jsonb_build_object(
          'quote_id', v_quote.id,
          'job_id', v_job_id,
          'quote_number', v_quote.quote_number,
          'accepted_by_name', p_signer_name
        )
      );
    EXCEPTION WHEN OTHERS THEN
      -- Log warning but don't fail the operation
      RAISE WARNING 'Failed to log quote acceptance audit: %', SQLERRM;
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

    -- Log audit entry (only on successful rejection)
    BEGIN
      PERFORM public.insert_audit_log(
        p_company_id := v_quote.company_id,
        p_entity_type := 'quote',
        p_entity_id := v_quote.id,
        p_action := 'quote_rejected',
        p_metadata := jsonb_build_object(
          'quote_id', v_quote.id,
          'quote_number', v_quote.quote_number,
          'rejected_by_name', p_signer_name
        )
      );
    EXCEPTION WHEN OTHERS THEN
      -- Log warning but don't fail the operation
      RAISE WARNING 'Failed to log quote rejection audit: %', SQLERRM;
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
    'reason', 'Unexpected error processing quote response'
  );
END;
$$;

-- 4) Update request_job_schedule_public to add rate limiting
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
  v_existing_request record;
  v_request_id uuid;
  v_job_service_date date;
  v_rate_limit_key text;
BEGIN
  -- Rate limiting: scheduling request
  -- Build stable key from token
  v_rate_limit_key := 'schedule_token:' || p_token::text;
  
  -- Check burst limit: 5 per minute
  BEGIN
    PERFORM public.check_rate_limit(v_rate_limit_key, 'schedule_request', 5, 60);
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'P0001' AND SQLERRM LIKE '%rate_limit_exceeded%' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'rate_limit_exceeded',
        'reason', 'Too many attempts - please wait a moment and try again'
      );
    ELSE
      RAISE;
    END IF;
  END;
  
  -- Check hourly limit: 20 per hour
  BEGIN
    PERFORM public.check_rate_limit(v_rate_limit_key, 'schedule_request', 20, 3600);
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'P0001' AND SQLERRM LIKE '%rate_limit_exceeded%' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'rate_limit_exceeded',
        'reason', 'Too many attempts - please wait a bit and try again'
      );
    ELSE
      RAISE;
    END IF;
  END;

  -- Lookup quote by public_token
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

  -- Extract IDs
  v_company_id := v_quote.company_id;
  v_job_id := v_quote.converted_job_id;
  v_quote_id := v_quote.id;

  -- Check d) Verify job exists and is not already scheduled
  SELECT service_date INTO v_job_service_date
  FROM public.jobs
  WHERE id = v_job_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'job_not_found',
      'reason', 'Job not found'
    );
  END IF;
  
  -- If job already has service_date set, reject the request
  IF v_job_service_date IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'job_already_scheduled',
      'reason', 'This job is already scheduled and cannot accept new schedule requests'
    );
  END IF;

  -- Check e) Check if an open request already exists for this job
  -- This is the key check: only ONE open request per job allowed
  -- (idempotency behavior preserved)
  SELECT id, requested_date, customer_note, created_at
  INTO v_existing_request
  FROM public.job_schedule_requests
  WHERE job_id = v_job_id
    AND status = 'requested'
  LIMIT 1;

  -- If open request exists, return idempotent success
  IF v_existing_request.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'request_id', v_existing_request.id,
      'requested_date', v_existing_request.requested_date,
      'already_exists', true,
      'reason', 'An open schedule request already exists for this job'
    );
  END IF;

  -- No open request exists - insert new one
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
    p_token,
    p_requested_date,
    p_customer_note,
    'requested'
  )
  RETURNING id INTO v_request_id;

  -- Return success
  RETURN jsonb_build_object(
    'ok', true,
    'request_id', v_request_id,
    'requested_date', p_requested_date,
    'already_exists', false
  );
EXCEPTION
  WHEN unique_violation THEN
    -- Catch unique index violation (defensive - should not happen due to check above)
    -- Return existing request if we can find it
    SELECT id, requested_date INTO v_existing_request
    FROM public.job_schedule_requests
    WHERE job_id = v_job_id
      AND status = 'requested'
    LIMIT 1;
    
    IF v_existing_request.id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ok', true,
        'request_id', v_existing_request.id,
        'requested_date', v_existing_request.requested_date,
        'already_exists', true,
        'reason', 'An open schedule request already exists for this job'
      );
    ELSE
      -- Should not reach here, but handle gracefully
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'unique_violation',
        'reason', 'Unable to create schedule request - please try again'
      );
    END IF;
END;
$$;

-- 5) Update get_schedule_request_status_public to add rate limiting (less strict)
CREATE OR REPLACE FUNCTION public.get_schedule_request_status_public(
  p_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_quote record;
  v_request record;
  v_rate_limit_key text;
BEGIN
  -- Rate limiting: schedule status check (less strict than request)
  -- Build stable key from token
  v_rate_limit_key := 'schedule_token:' || p_token::text;
  
  -- Check hourly limit: 60 per hour (no burst limit for read-only operation)
  BEGIN
    PERFORM public.check_rate_limit(v_rate_limit_key, 'schedule_status', 60, 3600);
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'P0001' AND SQLERRM LIKE '%rate_limit_exceeded%' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'rate_limit_exceeded',
        'reason', 'Too many requests - please wait a bit and try again'
      );
    ELSE
      RAISE;
    END IF;
  END;

  -- Lookup quote by public_token
  SELECT q.*
  INTO v_quote
  FROM public.quotes q
  WHERE q.public_token = p_token;

  -- Check a) Quote exists
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'not_found',
      'reason', 'Quote not found'
    );
  END IF;

  -- Check b) Quote has converted_job_id
  IF v_quote.converted_job_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'has_request', false,
      'reason', 'Job not yet created from quote'
    );
  END IF;

  -- Check if open request exists for this job
  SELECT id, requested_date, customer_note, created_at
  INTO v_request
  FROM public.job_schedule_requests
  WHERE job_id = v_quote.converted_job_id
    AND status = 'requested'
  LIMIT 1;

  -- Return status
  IF v_request.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'has_request', true,
      'request_id', v_request.id,
      'requested_date', v_request.requested_date,
      'customer_note', v_request.customer_note,
      'created_at', v_request.created_at
    );
  ELSE
    RETURN jsonb_build_object(
      'ok', true,
      'has_request', false
    );
  END IF;
END;
$$;

COMMIT;
