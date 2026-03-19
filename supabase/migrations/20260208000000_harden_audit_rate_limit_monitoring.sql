BEGIN;

-- =============================================================================
-- Phase 2 - Hardening Sprint 1: Audit + Rate Limiting + Monitoring
-- =============================================================================
-- This migration adds:
-- 1. Missing audit logging (quote_sent, invoice operations, invoice status transitions)
-- 2. Enhanced rate limiting with IP address tracking
-- 3. Ensures all critical actions are logged at DB layer
-- =============================================================================

-- =============================================================================
-- PART A: Audit Logging Coverage
-- =============================================================================

-- A1) Trigger to log quote_sent when status changes to 'sent' and sent_at is set
CREATE OR REPLACE FUNCTION public.tg_log_quote_sent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_old_status text;
  v_new_status text;
  v_old_sent_at timestamptz;
  v_new_sent_at timestamptz;
BEGIN
  v_old_status := OLD.status::text;
  v_new_status := NEW.status::text;
  v_old_sent_at := OLD.sent_at;
  v_new_sent_at := NEW.sent_at;

  -- Log when quote is sent: status changes to 'sent' OR sent_at is newly set
  IF (v_new_status = 'sent' AND (v_old_status IS NULL OR v_old_status != 'sent'))
     OR (v_new_sent_at IS NOT NULL AND v_old_sent_at IS NULL) THEN
    BEGIN
      PERFORM public.insert_audit_log(
        p_company_id := NEW.company_id,
        p_entity_type := 'quote',
        p_entity_id := NEW.id,
        p_action := 'quote_sent',
        p_metadata := jsonb_build_object(
          'quote_id', NEW.id,
          'quote_number', NEW.quote_number,
          'customer_id', NEW.customer_id,
          'sent_at', v_new_sent_at
        )
      );
    EXCEPTION WHEN OTHERS THEN
      -- Log warning but don't fail the operation
      RAISE WARNING 'Failed to log quote_sent audit: %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger (idempotent)
DROP TRIGGER IF EXISTS trg_log_quote_sent ON public.quotes;
CREATE TRIGGER trg_log_quote_sent
  AFTER UPDATE OF status, sent_at ON public.quotes
  FOR EACH ROW
  WHEN (
    (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'sent')
    OR (OLD.sent_at IS NULL AND NEW.sent_at IS NOT NULL)
  )
  EXECUTE FUNCTION public.tg_log_quote_sent();

-- A2) Ensure job_created_from_quote is logged (verify both paths log it)
-- Note: respond_to_quote_public already logs 'quote_accepted' which creates a job
-- Note: admin_convert_quote_to_job already logs 'quote_converted' which creates a job
-- Both are sufficient, but let's add explicit 'job_created_from_quote' action for clarity
-- We'll add this to the trigger that fires when converted_job_id is set

CREATE OR REPLACE FUNCTION public.tg_log_job_created_from_quote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  -- Log when job is created from quote: converted_job_id is newly set
  IF NEW.converted_job_id IS NOT NULL 
     AND (OLD.converted_job_id IS NULL OR OLD.converted_job_id != NEW.converted_job_id) THEN
    BEGIN
      PERFORM public.insert_audit_log(
        p_company_id := NEW.company_id,
        p_entity_type := 'job',
        p_entity_id := NEW.converted_job_id,
        p_action := 'job_created_from_quote',
        p_metadata := jsonb_build_object(
          'quote_id', NEW.id,
          'quote_number', NEW.quote_number,
          'job_id', NEW.converted_job_id,
          'customer_id', NEW.customer_id
        )
      );
    EXCEPTION WHEN OTHERS THEN
      -- Log warning but don't fail the operation
      RAISE WARNING 'Failed to log job_created_from_quote audit: %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger (idempotent)
DROP TRIGGER IF EXISTS trg_log_job_created_from_quote ON public.quotes;
CREATE TRIGGER trg_log_job_created_from_quote
  AFTER UPDATE OF converted_job_id ON public.quotes
  FOR EACH ROW
  WHEN (OLD.converted_job_id IS DISTINCT FROM NEW.converted_job_id AND NEW.converted_job_id IS NOT NULL)
  EXECUTE FUNCTION public.tg_log_job_created_from_quote();

-- A3) Add audit logging to admin_upsert_invoice_for_job
CREATE OR REPLACE FUNCTION public.admin_upsert_invoice_for_job(
  p_job_id uuid,
  p_pdf_path text,
  p_subtotal numeric,
  p_tax numeric,
  p_total numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_role text;
  v_job record;
  v_customer_id uuid;
  v_invoice_id uuid;
  v_existing_invoice_id uuid;
  v_is_update boolean;
BEGIN
  -- 1) Require authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- 2) Get caller profile: company_id + role
  SELECT p.company_id, p.role INTO v_company_id, v_role
  FROM public.profiles p
  WHERE p.id = v_user_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'NO_COMPANY';
  END IF;

  -- 3) Only admin can call this
  IF v_role <> 'admin' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  -- 4) Load job and ensure company_id matches (tenant isolation)
  SELECT j.* INTO v_job
  FROM public.jobs j
  WHERE j.id = p_job_id
    AND j.company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND';
  END IF;

  -- Extract customer_id from job record
  v_customer_id := v_job.customer_id;

  -- 5) Check if invoice already exists for this job
  SELECT id INTO v_existing_invoice_id
  FROM public.invoices
  WHERE job_id = p_job_id
    AND company_id = v_company_id
  FOR UPDATE;

  v_is_update := (v_existing_invoice_id IS NOT NULL);

  -- 6) Upsert invoice
  IF v_is_update THEN
    -- Update existing invoice
    UPDATE public.invoices
    SET
      pdf_path = p_pdf_path,
      subtotal = p_subtotal,
      tax = p_tax,
      total = p_total,
      issued_at = now(),
      updated_at = now()
    WHERE id = v_existing_invoice_id
    RETURNING id INTO v_invoice_id;
  ELSE
    -- Insert new invoice (status = 'draft' for newly created)
    INSERT INTO public.invoices (
      company_id,
      customer_id,
      job_id,
      pdf_path,
      subtotal,
      tax,
      total,
      status,
      issued_at
    )
    VALUES (
      v_company_id,
      v_customer_id,
      p_job_id,
      p_pdf_path,
      p_subtotal,
      p_tax,
      p_total,
      'draft',
      now()
    )
    RETURNING id INTO v_invoice_id;
  END IF;

  -- 7) Log audit entry
  BEGIN
    PERFORM public.insert_audit_log(
      p_company_id := v_company_id,
      p_entity_type := 'invoice',
      p_entity_id := v_invoice_id,
      p_action := CASE WHEN v_is_update THEN 'invoice_updated' ELSE 'invoice_created' END,
      p_metadata := jsonb_build_object(
        'invoice_id', v_invoice_id,
        'job_id', p_job_id,
        'subtotal', p_subtotal,
        'tax', p_tax,
        'total', p_total,
        'pdf_path', p_pdf_path
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Log warning but don't fail the operation
    RAISE WARNING 'Failed to log invoice audit: %', SQLERRM;
  END;

  -- 8) Return invoice ID
  RETURN v_invoice_id;
END;
$$;

-- A4) Add audit logging to update_invoice_status trigger
-- Update the trigger function to log status transitions
CREATE OR REPLACE FUNCTION public.tg_update_invoice_status_from_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_invoice_id uuid;
  v_invoice_company_id uuid;
  v_old_status public.invoice_status;
  v_new_status public.invoice_status;
BEGIN
  -- Determine which invoice_id to update
  IF TG_OP = 'DELETE' THEN
    v_invoice_id := OLD.invoice_id;
  ELSE
    v_invoice_id := NEW.invoice_id;
  END IF;

  -- Only update if invoice_id is set
  IF v_invoice_id IS NOT NULL THEN
    -- Get current invoice status before update
    SELECT status INTO v_old_status
    FROM public.invoices
    WHERE id = v_invoice_id;

    -- Call update_invoice_status (will handle tenant isolation internally)
    BEGIN
      PERFORM public.update_invoice_status(v_invoice_id);
    EXCEPTION WHEN OTHERS THEN
      -- Log error but don't fail the payment operation
      RAISE WARNING 'Failed to update invoice status for invoice %: %', v_invoice_id, SQLERRM;
    END;

    -- Get new status and company_id after update
    SELECT status, company_id INTO v_new_status, v_invoice_company_id
    FROM public.invoices
    WHERE id = v_invoice_id;

    -- Log if status changed
    IF v_old_status IS NOT NULL AND v_new_status IS NOT NULL AND v_old_status != v_new_status THEN
      BEGIN
        PERFORM public.insert_audit_log(
          p_company_id := v_invoice_company_id,
          p_entity_type := 'invoice',
          p_entity_id := v_invoice_id,
          p_action := 'invoice_status_auto_transition',
          p_metadata := jsonb_build_object(
            'invoice_id', v_invoice_id,
            'old_status', v_old_status::text,
            'new_status', v_new_status::text,
            'triggered_by', 'payment_' || TG_OP::text
          )
        );
      EXCEPTION WHEN OTHERS THEN
        -- Log warning but don't fail the operation
        RAISE WARNING 'Failed to log invoice status transition audit: %', SQLERRM;
      END;
    END IF;
  END IF;

  -- Return appropriate record
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- =============================================================================
-- PART B: Enhanced Rate Limiting with IP Address
-- =============================================================================

-- B1) Enhance rate_limit_events table to optionally store IP address
ALTER TABLE public.rate_limit_events
  ADD COLUMN IF NOT EXISTS ip_address text;

-- B2) Update check_rate_limit function to accept and use IP address
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key text,
  p_event text,
  p_limit int,
  p_window_seconds int,
  p_ip_address text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_count int;
  v_rate_limit_key text;
BEGIN
  -- Build composite key: base_key + ip_address (if provided)
  IF p_ip_address IS NOT NULL AND p_ip_address != '' THEN
    v_rate_limit_key := p_key || '|ip:' || p_ip_address;
  ELSE
    v_rate_limit_key := p_key;
  END IF;

  -- Count events in the time window
  SELECT COUNT(*)
  INTO v_count
  FROM public.rate_limit_events
  WHERE key = v_rate_limit_key
    AND event = p_event
    AND created_at > now() - (p_window_seconds || ' seconds')::interval;

  -- If limit exceeded, raise exception
  IF v_count >= p_limit THEN
    RAISE EXCEPTION 'rate_limit_exceeded' USING
      MESSAGE = format('Rate limit exceeded: %s events in %s seconds', p_limit, p_window_seconds),
      HINT = 'Please wait before trying again';
  END IF;

  -- Record this event
  INSERT INTO public.rate_limit_events (key, event, ip_address)
  VALUES (v_rate_limit_key, p_event, p_ip_address);

  -- Clean up old events (older than 24 hours) to prevent table bloat
  -- Only clean up occasionally (every ~1000 inserts) to avoid overhead
  IF random() < 0.001 THEN
    DELETE FROM public.rate_limit_events
    WHERE created_at < now() - interval '24 hours';
  END IF;

  RETURN true;
END;
$$;

-- B3) Create helper function for public RPCs to extract IP from request context
-- Note: Supabase RPCs don't have direct access to request IP, but we can use
-- a workaround: accept IP as optional parameter and use it if provided
-- For now, we'll update the public RPCs to accept an optional ip_address parameter
-- and use it in rate limiting. Frontend can pass it via a custom header or parameter.

-- Update get_quote_public to accept optional ip_address and use it in rate limiting
CREATE OR REPLACE FUNCTION public.get_quote_public(
  p_token uuid,
  p_ip_address text DEFAULT NULL
)
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
  
  -- Check burst limit: 30 per minute (per token+ip)
  BEGIN
    PERFORM public.check_rate_limit(v_rate_limit_key, 'quote_viewed', 30, 60, p_ip_address);
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
    PERFORM public.check_rate_limit(v_rate_limit_key, 'quote_viewed', 120, 3600, p_ip_address);
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

-- Update other public RPCs similarly (mark_quote_viewed_public, respond_to_quote_public, request_job_schedule_public)
-- For brevity, we'll update the most critical ones. The pattern is the same.

-- Update mark_quote_viewed_public
CREATE OR REPLACE FUNCTION public.mark_quote_viewed_public(
  p_token uuid,
  p_ip_address text DEFAULT NULL
)
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
  v_rate_limit_key := 'quote_token:' || p_token::text;
  
  -- Check burst limit: 30 per minute
  BEGIN
    PERFORM public.check_rate_limit(v_rate_limit_key, 'quote_viewed', 30, 60, p_ip_address);
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
    PERFORM public.check_rate_limit(v_rate_limit_key, 'quote_viewed', 120, 3600, p_ip_address);
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

-- Update respond_to_quote_public
CREATE OR REPLACE FUNCTION public.respond_to_quote_public(
  p_token uuid,
  p_action text,
  p_signer_name text,
  p_comment text DEFAULT NULL,
  p_ip_address text DEFAULT NULL
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
  v_rate_limit_key := 'quote_token:' || p_token::text;
  
  -- Check burst limit: 5 per minute (per token+ip)
  BEGIN
    PERFORM public.check_rate_limit(v_rate_limit_key, 'quote_respond', 5, 60, p_ip_address);
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
    PERFORM public.check_rate_limit(v_rate_limit_key, 'quote_respond', 20, 3600, p_ip_address);
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
      RAISE WARNING 'Failed to log quote rejection audit: %', SQLERRM;
    END;

    -- Return success
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'rejected',
      'job_id', NULL
    );
  END IF;

  -- Should never reach here
  RETURN jsonb_build_object(
    'ok', false,
    'error', 'unexpected_error',
    'reason', 'Unexpected error processing quote response'
  );
END;
$$;

-- Update request_job_schedule_public
CREATE OR REPLACE FUNCTION public.request_job_schedule_public(
  p_token uuid,
  p_requested_date date,
  p_customer_note text DEFAULT NULL,
  p_ip_address text DEFAULT NULL
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
  v_rate_limit_key := 'schedule_token:' || p_token::text;
  
  -- Check burst limit: 5 per minute (per token+ip)
  BEGIN
    PERFORM public.check_rate_limit(v_rate_limit_key, 'schedule_request', 5, 60, p_ip_address);
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
    PERFORM public.check_rate_limit(v_rate_limit_key, 'schedule_request', 20, 3600, p_ip_address);
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
    -- Catch unique index violation (defensive)
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
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'unique_violation',
        'reason', 'Unable to create schedule request - please try again'
      );
    END IF;
END;
$$;

-- Add index for rate limit queries with IP
CREATE INDEX IF NOT EXISTS idx_rate_limit_events_key_ip_created 
  ON public.rate_limit_events(key, ip_address, created_at DESC)
  WHERE ip_address IS NOT NULL;

COMMIT;
