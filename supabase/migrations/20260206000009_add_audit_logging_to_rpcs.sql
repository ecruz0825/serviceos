BEGIN;

-- =============================================================================
-- Add Audit Logging to RPC Functions
-- Hooks insert_audit_log into critical lifecycle actions
-- =============================================================================

-- 1) Update admin_convert_quote_to_job to log quote_converted
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

  -- 4) If quote.converted_job_id is not null, return idempotent response (no logging on idempotent)
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

  -- Log audit entry (only on successful conversion)
  BEGIN
    PERFORM public.insert_audit_log(
      p_company_id := v_company_id,
      p_entity_type := 'quote',
      p_entity_id := p_quote_id,
      p_action := 'quote_converted',
      p_metadata := jsonb_build_object(
        'quote_id', p_quote_id,
        'job_id', v_job_id,
        'quote_number', v_quote.quote_number
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Log warning but don't fail the operation
    RAISE WARNING 'Failed to log quote conversion audit: %', SQLERRM;
  END;

  -- Return success with created status
  RETURN jsonb_build_object(
    'status', 'created',
    'job_id', v_job_id
  );
END;
$$;

-- 2) Update respond_to_quote_public to log quote_accepted/quote_rejected
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
BEGIN
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

-- 3) Update upsert_invoice_from_job to log invoice_upserted
-- Note: This function is complex with conditional due_date handling, so we'll update it carefully
CREATE OR REPLACE FUNCTION public.upsert_invoice_from_job(p_job_id uuid)
RETURNS jsonb
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
  v_job_cost numeric;
  v_invoice_pdf_path text;
  v_invoice_uploaded_at timestamptz;
  v_invoice_id uuid;
  v_total_paid numeric;
  v_balance_due numeric;
  v_status public.invoice_status;
  v_due_date timestamptz;
BEGIN
  -- 1) Require authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'AUTH_REQUIRED',
      'message', 'Authentication required'
    );
  END IF;

  -- 2) Get caller profile: company_id + role
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

  -- 3) Only admin/manager/dispatcher can upsert invoices
  IF v_role NOT IN ('admin', 'manager', 'dispatcher') THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'FORBIDDEN',
      'message', 'Only admins, managers, and dispatchers can create invoices'
    );
  END IF;

  -- 4) Load job and ensure company_id matches
  SELECT j.* INTO v_job
  FROM public.jobs j
  WHERE j.id = p_job_id
    AND j.company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'JOB_NOT_FOUND',
      'message', 'Job not found or access denied'
    );
  END IF;

  -- 5) Extract values from job
  v_customer_id := v_job.customer_id;
  v_job_cost := COALESCE(v_job.job_cost, 0);
  v_invoice_pdf_path := v_job.invoice_path;
  v_invoice_uploaded_at := v_job.invoice_uploaded_at;

  -- 6) Compute total paid from payments ledger
  SELECT COALESCE(SUM(p.amount), 0)
  INTO v_total_paid
  FROM public.payments p
  WHERE p.job_id = p_job_id
    AND p.company_id = v_company_id
    AND p.status = 'posted'
    AND (p.voided_at IS NULL);

  -- 7) Compute balance_due
  v_balance_due := GREATEST(v_job_cost - v_total_paid, 0);

  -- 8) Determine status: if invoice_pdf_path exists, set to 'sent', else 'draft'
  IF v_invoice_pdf_path IS NOT NULL AND length(trim(v_invoice_pdf_path)) > 0 THEN
    v_status := 'sent';
  ELSE
    v_status := 'draft';
  END IF;

  -- 9) Set due_date: 14 days from now
  v_due_date := now() + interval '14 days';

  -- 10) Upsert invoice (INSERT ... ON CONFLICT DO UPDATE)
  -- Check if due_date column exists using information_schema
  -- If it exists (migration 00006 has run), include it in the INSERT/UPDATE
  -- If it doesn't exist, omit it
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'invoices'
      AND column_name = 'due_date'
  ) THEN
    -- due_date column exists - include it
    INSERT INTO public.invoices (
      company_id,
      customer_id,
      job_id,
      invoice_number,
      status,
      subtotal,
      tax,
      total,
      balance_due,
      invoice_pdf_path,
      invoice_uploaded_at,
      due_date
    ) VALUES (
      v_company_id,
      v_customer_id,
      p_job_id,
      NULL,
      v_status,
      v_job_cost,
      0,
      v_job_cost,
      v_balance_due,
      v_invoice_pdf_path,
      v_invoice_uploaded_at,
      v_due_date
    )
    ON CONFLICT (job_id) DO UPDATE SET
      status = EXCLUDED.status,
      subtotal = EXCLUDED.subtotal,
      tax = EXCLUDED.tax,
      total = EXCLUDED.total,
      balance_due = EXCLUDED.balance_due,
      invoice_pdf_path = EXCLUDED.invoice_pdf_path,
      invoice_uploaded_at = EXCLUDED.invoice_uploaded_at,
      due_date = COALESCE(public.invoices.due_date, EXCLUDED.due_date),
      updated_at = now()
    RETURNING id INTO v_invoice_id;
  ELSE
    -- due_date column doesn't exist yet - omit it
    INSERT INTO public.invoices (
      company_id,
      customer_id,
      job_id,
      invoice_number,
      status,
      subtotal,
      tax,
      total,
      balance_due,
      invoice_pdf_path,
      invoice_uploaded_at
    ) VALUES (
      v_company_id,
      v_customer_id,
      p_job_id,
      NULL,
      v_status,
      v_job_cost,
      0,
      v_job_cost,
      v_balance_due,
      v_invoice_pdf_path,
      v_invoice_uploaded_at
    )
    ON CONFLICT (job_id) DO UPDATE SET
      status = EXCLUDED.status,
      subtotal = EXCLUDED.subtotal,
      tax = EXCLUDED.tax,
      total = EXCLUDED.total,
      balance_due = EXCLUDED.balance_due,
      invoice_pdf_path = EXCLUDED.invoice_pdf_path,
      invoice_uploaded_at = EXCLUDED.invoice_uploaded_at,
      updated_at = now()
    RETURNING id INTO v_invoice_id;
  END IF;

  -- 11) Recompute status to ensure correctness (handles paid/overdue/sent transitions)
  -- Note: This will be a no-op if recompute_invoice_status doesn't exist yet (backwards-compatible)
  BEGIN
    PERFORM public.recompute_invoice_status(v_invoice_id);
  EXCEPTION WHEN OTHERS THEN
    -- Function may not exist yet if migration 20260206000006 hasn't run
    -- This is fine, status was already set correctly above
    NULL;
  END;

  -- 12) Log audit entry (only on successful upsert)
  BEGIN
    PERFORM public.insert_audit_log(
      p_company_id := v_company_id,
      p_entity_type := 'invoice',
      p_entity_id := v_invoice_id,
      p_action := 'invoice_upserted',
      p_metadata := jsonb_build_object(
        'job_id', p_job_id,
        'invoice_id', v_invoice_id,
        'total', v_job_cost,
        'balance_due', v_balance_due
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Log warning but don't fail the operation
    RAISE WARNING 'Failed to log invoice upsert audit: %', SQLERRM;
  END;

  -- 13) Return success
  RETURN jsonb_build_object(
    'status', 'success',
    'invoice_id', v_invoice_id
  );
END;
$$;

-- 4) Update recompute_invoice_status to log invoice_status_changed (only when status actually changes)
CREATE OR REPLACE FUNCTION public.recompute_invoice_status(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_role text;
  v_invoice record;
  v_total_paid numeric;
  v_balance_due numeric;
  v_new_status public.invoice_status;
  v_old_status public.invoice_status;
  v_old_balance_due numeric;
BEGIN
  -- 1) Require authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'AUTH_REQUIRED',
      'message', 'Authentication required'
    );
  END IF;

  -- 2) Get caller profile: company_id + role
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

  -- 3) Only admin/manager/dispatcher can recompute status
  IF v_role NOT IN ('admin', 'manager', 'dispatcher') THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'FORBIDDEN',
      'message', 'Only admins, managers, and dispatchers can recompute invoice status'
    );
  END IF;

  -- 4) Load invoice and ensure company_id matches
  SELECT i.* INTO v_invoice
  FROM public.invoices i
  WHERE i.id = p_invoice_id
    AND i.company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'INVOICE_NOT_FOUND',
      'message', 'Invoice not found or access denied'
    );
  END IF;

  -- Store old values for logging
  v_old_status := v_invoice.status;
  v_old_balance_due := v_invoice.balance_due;

  -- 5) Recompute balance_due from payments ledger
  SELECT COALESCE(SUM(p.amount), 0)
  INTO v_total_paid
  FROM public.payments p
  WHERE p.job_id = v_invoice.job_id
    AND p.company_id = v_company_id
    AND p.status = 'posted'
    AND (p.voided_at IS NULL);

  v_balance_due := GREATEST(v_invoice.total - v_total_paid, 0);

  -- 6) Determine new status based on rules
  v_new_status := v_invoice.status;

  -- Rule 1: If balance_due <= 0, set to 'paid'
  IF v_balance_due <= 0 THEN
    v_new_status := 'paid';
    -- Set paid_at if not already set
    IF v_invoice.paid_at IS NULL THEN
      UPDATE public.invoices
      SET paid_at = now()
      WHERE id = p_invoice_id;
    END IF;
  -- Rule 2: If due_date passed and status is draft/sent, set to 'overdue'
  ELSIF v_invoice.due_date IS NOT NULL 
    AND v_invoice.due_date < now() 
    AND v_invoice.status IN ('draft', 'sent') THEN
    v_new_status := 'overdue';
  -- Rule 3: If invoice_pdf_path exists and status is 'draft', set to 'sent'
  ELSIF v_invoice.invoice_pdf_path IS NOT NULL 
    AND length(trim(v_invoice.invoice_pdf_path)) > 0 
    AND v_invoice.status = 'draft' THEN
    v_new_status := 'sent';
    -- Set sent_at if not already set
    IF v_invoice.sent_at IS NULL THEN
      UPDATE public.invoices
      SET sent_at = now()
      WHERE id = p_invoice_id;
    END IF;
  END IF;

  -- 7) Update invoice with new status, balance_due, and last_status_eval_at
  UPDATE public.invoices
  SET status = v_new_status,
      balance_due = v_balance_due,
      last_status_eval_at = now(),
      updated_at = now()
  WHERE id = p_invoice_id;

  -- 8) Log audit entry ONLY if status or balance_due actually changed
  IF v_old_status != v_new_status OR v_old_balance_due != v_balance_due THEN
    BEGIN
      PERFORM public.insert_audit_log(
        p_company_id := v_company_id,
        p_entity_type := 'invoice',
        p_entity_id := p_invoice_id,
        p_action := 'invoice_status_changed',
        p_metadata := jsonb_build_object(
          'old_status', v_old_status,
          'new_status', v_new_status,
          'old_balance', v_old_balance_due,
          'new_balance', v_balance_due
        )
      );
    EXCEPTION WHEN OTHERS THEN
      -- Log warning but don't fail the operation
      RAISE WARNING 'Failed to log invoice status change audit: %', SQLERRM;
    END;
  END IF;

  -- 9) Return success
  RETURN jsonb_build_object(
    'status', 'success',
    'invoice_id', p_invoice_id,
    'balance_due', v_balance_due,
    'new_status', v_new_status
  );
END;
$$;

-- 5) Update void_invoice to log invoice_voided
CREATE OR REPLACE FUNCTION public.void_invoice(p_invoice_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_role text;
  v_invoice record;
BEGIN
  -- 1) Require authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'AUTH_REQUIRED',
      'message', 'Authentication required'
    );
  END IF;

  -- 2) Get caller profile: company_id + role
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

  -- 3) Only admin/manager/dispatcher can void invoices
  IF v_role NOT IN ('admin', 'manager', 'dispatcher') THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'FORBIDDEN',
      'message', 'Only admins, managers, and dispatchers can void invoices'
    );
  END IF;

  -- 4) Load invoice and ensure company_id matches
  SELECT i.* INTO v_invoice
  FROM public.invoices i
  WHERE i.id = p_invoice_id
    AND i.company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'INVOICE_NOT_FOUND',
      'message', 'Invoice not found or access denied'
    );
  END IF;

  -- 5) Check if already voided (idempotent - no logging on idempotent)
  IF v_invoice.status = 'void' THEN
    RETURN jsonb_build_object(
      'status', 'success',
      'invoice_id', p_invoice_id,
      'message', 'Invoice already voided'
    );
  END IF;

  -- 6) Set status to 'void' and voided_at (does NOT change balance_due)
  UPDATE public.invoices
  SET status = 'void',
      voided_at = now(),
      updated_at = now()
  WHERE id = p_invoice_id;

  -- 7) Log audit entry (only on successful void)
  BEGIN
    PERFORM public.insert_audit_log(
      p_company_id := v_company_id,
      p_entity_type := 'invoice',
      p_entity_id := p_invoice_id,
      p_action := 'invoice_voided',
      p_metadata := jsonb_build_object(
        'reason', COALESCE(p_reason, 'No reason provided')
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Log warning but don't fail the operation
    RAISE WARNING 'Failed to log invoice void audit: %', SQLERRM;
  END;

  -- 8) Return success
  RETURN jsonb_build_object(
    'status', 'success',
    'invoice_id', p_invoice_id
  );
END;
$$;

-- 6) Update record_payment to log payment_recorded
-- Note: This function returns a TABLE, so we need to be careful with the structure
CREATE OR REPLACE FUNCTION public.record_payment(
  p_job_id uuid,
  p_amount numeric,
  p_method text,
  p_notes text DEFAULT NULL,
  p_external_ref text DEFAULT NULL
)
RETURNS TABLE (
  payment_id uuid,
  job_id uuid,
  job_cost numeric,
  total_paid numeric,
  balance_due numeric,
  external_ref text,
  receipt_number text,
  received_by uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_role text;
  v_company_id uuid;
  v_job record;
  v_paid_so_far numeric;
  v_new_total numeric;
  v_allowed numeric;
  v_crew_member_id uuid;
  v_payment_id uuid;
  v_external_ref text;
  v_receipt_number text;
  v_received_by uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT p.role, p.company_id INTO v_role, v_company_id
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'NO_COMPANY';
  END IF;

  IF v_role NOT IN ('admin','crew') THEN
    RAISE EXCEPTION 'NOT_ALLOWED';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  -- Lock job row for consistent totals
  SELECT *
  INTO v_job
  FROM public.jobs j
  WHERE j.id = p_job_id
    AND j.company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND';
  END IF;

  -- Crew can only record payments for jobs assigned to them
  IF v_role = 'crew' THEN
    v_crew_member_id := public.current_crew_member_id();
    IF v_crew_member_id IS NULL THEN
      RAISE EXCEPTION 'CREW_NOT_LINKED';
    END IF;

    IF v_job.assigned_to IS NULL OR v_job.assigned_to <> v_crew_member_id THEN
      RAISE EXCEPTION 'JOB_NOT_ASSIGNED_TO_CREW';
    END IF;
  END IF;

  SELECT COALESCE(SUM(p.amount), 0)
  INTO v_paid_so_far
  FROM public.payments p
  WHERE p.job_id = p_job_id
    AND p.company_id = v_company_id
    AND p.status = 'posted';

  v_new_total := v_paid_so_far + p_amount;
  v_allowed := COALESCE(v_job.job_cost, 0);

  -- Block overpayment (and log attempt)
  IF v_allowed > 0 AND v_new_total > v_allowed THEN
    INSERT INTO public.overpayments_log (job_id, crew_id, entered_amount, allowed_amount, company_id)
    VALUES (
      p_job_id,
      COALESCE(v_job.assigned_to, public.current_crew_member_id()),
      p_amount,
      GREATEST(v_allowed - v_paid_so_far, 0),
      v_company_id
    );

    RAISE EXCEPTION 'OVERPAYMENT';
  END IF;

  INSERT INTO public.payments AS payments (
    job_id,
    amount,
    payment_method,
    paid,
    date_paid,
    notes,
    company_id,
    paid_at,
    status,
    created_by,
    external_ref
  )
  VALUES (
    p_job_id,
    p_amount,
    p_method,
    true,
    CURRENT_DATE,
    p_notes,
    v_company_id,
    now(),
    'posted',
    auth.uid(),
    p_external_ref
  )
  RETURNING
    payments.id,
    payments.external_ref,
    payments.receipt_number,
    payments.received_by
  INTO v_payment_id, v_external_ref, v_receipt_number, v_received_by;

  -- Log audit entry (only on successful payment recording)
  BEGIN
    PERFORM public.insert_audit_log(
      p_company_id := v_company_id,
      p_entity_type := 'payment',
      p_entity_id := v_payment_id,
      p_action := 'payment_recorded',
      p_metadata := jsonb_build_object(
        'payment_id', v_payment_id,
        'amount', p_amount,
        'job_id', p_job_id
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Log warning but don't fail the operation
    RAISE WARNING 'Failed to log payment audit: %', SQLERRM;
  END;

  payment_id := v_payment_id;
  job_id := p_job_id;
  job_cost := v_allowed;
  total_paid := v_new_total;
  balance_due := GREATEST(v_allowed - v_new_total, 0);
  external_ref := v_external_ref;
  receipt_number := v_receipt_number;
  received_by := v_received_by;

  RETURN NEXT;
END;
$$;

-- 7) Update void_payment to log payment_voided
CREATE OR REPLACE FUNCTION public.void_payment(
  p_payment_id uuid,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_role text;
  v_company_id uuid;
  v_payment record;
  v_customer_id uuid;
  v_job_id uuid;
  v_amount numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- Validate reason is provided and not empty
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;

  SELECT p.role, p.company_id INTO v_role, v_company_id
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'NO_COMPANY';
  END IF;

  IF v_role <> 'admin' THEN
    RAISE EXCEPTION 'ADMIN_ONLY';
  END IF;

  -- Lock payment row for update
  SELECT *
  INTO v_payment
  FROM public.payments pay
  WHERE pay.id = p_payment_id
    AND pay.company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_NOT_FOUND';
  END IF;

  -- Validate payment is posted (not already voided)
  IF v_payment.status <> 'posted' THEN
    RAISE EXCEPTION 'PAYMENT_ALREADY_VOIDED';
  END IF;

  -- Store values for logging
  v_job_id := v_payment.job_id;
  v_amount := v_payment.amount;

  -- Update payment to voided
  UPDATE public.payments
  SET status = 'voided',
      voided_at = now(),
      void_reason = trim(p_reason)
  WHERE id = p_payment_id;

  -- Get customer_id from job for timeline logging
  IF v_job_id IS NOT NULL THEN
    SELECT customer_id INTO v_customer_id
    FROM public.jobs
    WHERE id = v_job_id
      AND company_id = v_company_id;
  END IF;

  -- Log to customer timeline (wrapped in exception handler so logging failure doesn't block void)
  IF v_customer_id IS NOT NULL THEN
    BEGIN
      PERFORM public.log_customer_activity(
        p_customer_id := v_customer_id,
        p_event_type := 'payment.voided',
        p_event_title := 'Payment voided',
        p_event_description := format('Payment of $%s voided. Reason: %s', v_amount, trim(p_reason)),
        p_event_category := 'payments',
        p_related_type := 'payment',
        p_related_id := p_payment_id,
        p_severity := 'warning',
        p_event_data := jsonb_build_object(
          'job_id', v_job_id,
          'amount', v_amount,
          'reason', trim(p_reason)
        )
      );
    EXCEPTION
      WHEN OTHERS THEN
        -- Log warning but don't fail the void operation
        RAISE WARNING 'Failed to log payment void activity: %', SQLERRM;
    END;
  END IF;

  -- Log audit entry (only on successful void)
  BEGIN
    PERFORM public.insert_audit_log(
      p_company_id := v_company_id,
      p_entity_type := 'payment',
      p_entity_id := p_payment_id,
      p_action := 'payment_voided',
      p_metadata := jsonb_build_object(
        'payment_id', p_payment_id,
        'reason', trim(p_reason)
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Log warning but don't fail the operation
    RAISE WARNING 'Failed to log payment void audit: %', SQLERRM;
  END;

  RETURN p_payment_id;
END;
$$;

COMMIT;
