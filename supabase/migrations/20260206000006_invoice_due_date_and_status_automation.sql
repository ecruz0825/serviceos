BEGIN;

-- =============================================================================
-- Invoice Lifecycle Hardening (Phase 1.1)
-- Adds due dates, status automation, and admin actions
-- =============================================================================

-- 1) Alter invoices table: add due_date and last_status_eval_at
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS due_date timestamptz NULL,
  ADD COLUMN IF NOT EXISTS last_status_eval_at timestamptz NULL;

-- 2) Create trigger function to set default due_date on insert (14 days from created_at)
CREATE OR REPLACE FUNCTION public.set_invoice_due_date()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- If due_date is not provided, set to 14 days from created_at
  IF NEW.due_date IS NULL THEN
    NEW.due_date := NEW.created_at + interval '14 days';
  END IF;
  RETURN NEW;
END;
$$;

-- Drop and recreate trigger
DROP TRIGGER IF EXISTS trg_set_invoice_due_date ON public.invoices;
CREATE TRIGGER trg_set_invoice_due_date
  BEFORE INSERT ON public.invoices
  FOR EACH ROW
  WHEN (NEW.due_date IS NULL)
  EXECUTE FUNCTION public.set_invoice_due_date();

-- 3) Create recompute_invoice_status function
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

  -- 8) Return success
  RETURN jsonb_build_object(
    'status', 'success',
    'invoice_id', p_invoice_id,
    'balance_due', v_balance_due,
    'new_status', v_new_status
  );
END;
$$;

-- 4) Create bulk recompute function for cron use
CREATE OR REPLACE FUNCTION public.recompute_all_invoice_statuses(p_company_id uuid DEFAULT NULL)
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
  v_processed_count integer := 0;
  v_error_count integer := 0;
  v_result jsonb;
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

  -- 3) Only admin can run bulk recompute
  IF v_role <> 'admin' THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'FORBIDDEN',
      'message', 'Only admins can run bulk invoice status recomputation'
    );
  END IF;

  -- 4) Use provided company_id or caller's company_id
  IF p_company_id IS NOT NULL THEN
    -- Verify admin has access to the specified company (must be their own)
    IF p_company_id <> v_company_id THEN
      RETURN jsonb_build_object(
        'status', 'error',
        'error', 'FORBIDDEN',
        'message', 'Cannot recompute invoices for other companies'
      );
    END IF;
    v_company_id := p_company_id;
  END IF;

  -- 5) Iterate invoices that need recomputation
  -- (last_status_eval_at is null OR older than 12 hours)
  FOR v_invoice IN
    SELECT id
    FROM public.invoices
    WHERE company_id = v_company_id
      AND (last_status_eval_at IS NULL 
           OR last_status_eval_at < now() - interval '12 hours')
      AND status <> 'void' -- Skip voided invoices
    ORDER BY created_at ASC
  LOOP
    BEGIN
      v_result := public.recompute_invoice_status(v_invoice.id);
      IF v_result->>'status' = 'success' THEN
        v_processed_count := v_processed_count + 1;
      ELSE
        v_error_count := v_error_count + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
    END;
  END LOOP;

  -- 6) Return summary
  RETURN jsonb_build_object(
    'status', 'success',
    'processed_count', v_processed_count,
    'error_count', v_error_count,
    'company_id', v_company_id
  );
END;
$$;

-- 5) Create void_invoice RPC
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

  -- 5) Check if already voided
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

  -- 7) Return success
  RETURN jsonb_build_object(
    'status', 'success',
    'invoice_id', p_invoice_id
  );
END;
$$;

-- 6) Grant execute permissions
GRANT EXECUTE ON FUNCTION public.recompute_invoice_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_all_invoice_statuses(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_invoice(uuid, text) TO authenticated;

COMMIT;
