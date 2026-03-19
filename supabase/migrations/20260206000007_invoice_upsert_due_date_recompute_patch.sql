BEGIN;

-- =============================================================================
-- Invoice Upsert Due Date and Recompute Patch
-- Updates upsert_invoice_from_job to set due_date and call recompute_invoice_status
-- Safe to run if migration 20260206000006 already exists (due_date column exists)
-- =============================================================================

-- Update upsert_invoice_from_job to:
-- 1) Set due_date when inserting new invoices (14 days from now)
-- 2) Preserve existing due_date on conflict
-- 3) Call recompute_invoice_status after upsert (if function exists)

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

  -- 12) Return success
  RETURN jsonb_build_object(
    'status', 'success',
    'invoice_id', v_invoice_id
  );
END;
$$;

COMMIT;
