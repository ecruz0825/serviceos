-- =============================================================================
-- Invoice Lifecycle RPCs (Invoice Pipeline Step 3A)
-- =============================================================================
-- Centralizes invoice lifecycle transitions in DB so frontend only calls RPCs.
-- Prevents invoice drift by locking down direct writes.
--
-- RPCs:
-- - send_invoice: Mark invoice as sent (requires PDF)
-- - void_invoice: Void an invoice (updated to return invoice row)
-- - eval_invoice_overdue: Evaluate and set overdue status for single invoice
-- - eval_invoices_overdue_for_company: Batch evaluate overdue for company
-- =============================================================================

BEGIN;

-- =============================================================================
-- A) RPC: send_invoice
-- =============================================================================

CREATE OR REPLACE FUNCTION public.send_invoice(
  p_invoice_id uuid,
  p_pdf_path text DEFAULT NULL,
  p_due_date timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  job_id uuid,
  invoice_number text,
  status public.invoice_status,
  pdf_path text,
  sent_at timestamptz,
  due_date timestamptz,
  updated_at timestamptz
)
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
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- 2) Get caller profile: company_id + role
  SELECT p.company_id, p.role INTO v_company_id, v_role
  FROM public.profiles p
  WHERE p.id = v_user_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'NO_COMPANY';
  END IF;

  -- 3) Only admin/manager/dispatcher can send invoices
  IF v_role NOT IN ('admin', 'manager', 'dispatcher') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING
      MESSAGE = 'Only admins, managers, and dispatchers can send invoices';
  END IF;

  -- 4) Load invoice and ensure company_id matches (tenant isolation)
  SELECT *
  INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
    AND company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND';
  END IF;

  -- 5) Validate invoice can be sent
  IF v_invoice.status = 'void' THEN
    RAISE EXCEPTION 'INVOICE_VOID' USING
      MESSAGE = 'Cannot send a voided invoice';
  END IF;

  -- 6) If status is 'paid', allow no-op (idempotent)
  IF v_invoice.status = 'paid' THEN
    RETURN QUERY
    SELECT
      v_invoice.id,
      v_invoice.job_id,
      v_invoice.invoice_number,
      v_invoice.status,
      v_invoice.pdf_path,
      v_invoice.sent_at,
      v_invoice.due_date,
      v_invoice.updated_at;
    RETURN;
  END IF;

  -- 7) Update pdf_path if provided
  IF p_pdf_path IS NOT NULL AND btrim(p_pdf_path) <> '' THEN
    v_invoice.pdf_path := p_pdf_path;
  END IF;

  -- 8) Ensure pdf_path exists (required for sending)
  IF v_invoice.pdf_path IS NULL OR btrim(v_invoice.pdf_path) = '' THEN
    RAISE EXCEPTION 'PDF_REQUIRED' USING
      MESSAGE = 'Invoice PDF is required before sending';
  END IF;

  -- 9) Update invoice
  UPDATE public.invoices
  SET
    pdf_path = COALESCE(p_pdf_path, pdf_path),
    status = 'sent',
    sent_at = COALESCE(sent_at, now()),
    due_date = COALESCE(p_due_date, due_date),
    updated_at = now()
  WHERE id = p_invoice_id;

  -- 10) Return updated invoice
  RETURN QUERY
  SELECT
    i.id,
    i.job_id,
    i.invoice_number,
    i.status,
    i.pdf_path,
    i.sent_at,
    i.due_date,
    i.updated_at
  FROM public.invoices i
  WHERE i.id = p_invoice_id;
END;
$$;

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION public.send_invoice(uuid, text, timestamptz) TO authenticated;

-- =============================================================================
-- B) RPC: void_invoice (updated to return invoice row)
-- =============================================================================

-- Drop existing function first (it returns jsonb, we need to change to TABLE)
DROP FUNCTION IF EXISTS public.void_invoice(uuid, text);

CREATE OR REPLACE FUNCTION public.void_invoice(
  p_invoice_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  job_id uuid,
  invoice_number text,
  status public.invoice_status,
  voided_at timestamptz,
  updated_at timestamptz,
  metadata jsonb
)
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
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- 2) Get caller profile: company_id + role
  SELECT p.company_id, p.role INTO v_company_id, v_role
  FROM public.profiles p
  WHERE p.id = v_user_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'NO_COMPANY';
  END IF;

  -- 3) Only admin/manager/dispatcher can void invoices
  IF v_role NOT IN ('admin', 'manager', 'dispatcher') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING
      MESSAGE = 'Only admins, managers, and dispatchers can void invoices';
  END IF;

  -- 4) Load invoice and ensure company_id matches (tenant isolation)
  SELECT *
  INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
    AND company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND';
  END IF;

  -- 5) If already voided, return current state (idempotent)
  IF v_invoice.status = 'void' THEN
    RETURN QUERY
    SELECT
      v_invoice.id,
      v_invoice.job_id,
      v_invoice.invoice_number,
      v_invoice.status,
      v_invoice.voided_at,
      v_invoice.updated_at,
      v_invoice.metadata;
    RETURN;
  END IF;

  -- 6) Update invoice to void status
  UPDATE public.invoices
  SET
    status = 'void',
    voided_at = COALESCE(voided_at, now()),
    updated_at = now(),
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'void_reason', p_reason,
      'voided_by', v_user_id,
      'voided_at', now()
    )
  WHERE id = p_invoice_id;

  -- 7) Return updated invoice
  RETURN QUERY
  SELECT
    i.id,
    i.job_id,
    i.invoice_number,
    i.status,
    i.voided_at,
    i.updated_at,
    i.metadata
  FROM public.invoices i
  WHERE i.id = p_invoice_id;
END;
$$;

-- Grant execute to authenticated (idempotent - already granted, but ensure it's there)
GRANT EXECUTE ON FUNCTION public.void_invoice(uuid, text) TO authenticated;

-- =============================================================================
-- C) RPC: eval_invoice_overdue
-- =============================================================================

CREATE OR REPLACE FUNCTION public.eval_invoice_overdue(p_invoice_id uuid)
RETURNS TABLE (
  id uuid,
  job_id uuid,
  invoice_number text,
  status public.invoice_status,
  due_date timestamptz,
  balance_due numeric,
  last_status_eval_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_role text;
  v_invoice record;
  v_is_overdue boolean;
BEGIN
  -- 1) Require authentication (or allow service role for scheduled jobs)
  v_user_id := auth.uid();
  
  -- If called from service role (scheduled job), skip role check
  IF v_user_id IS NOT NULL THEN
    SELECT p.company_id, p.role INTO v_company_id, v_role
    FROM public.profiles p
    WHERE p.id = v_user_id;

    IF v_company_id IS NULL THEN
      RAISE EXCEPTION 'NO_COMPANY';
    END IF;

    -- Only admin/manager/dispatcher can manually evaluate (or service role)
    IF v_role NOT IN ('admin', 'manager', 'dispatcher') THEN
      RAISE EXCEPTION 'FORBIDDEN' USING
        MESSAGE = 'Only admins, managers, and dispatchers can evaluate invoice status';
    END IF;
  END IF;

  -- 2) Load invoice
  SELECT *
  INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND';
  END IF;

  -- 3) Tenant isolation: if user context exists, validate company match
  IF v_user_id IS NOT NULL AND v_company_id <> v_invoice.company_id THEN
    RAISE EXCEPTION 'TENANT_MISMATCH';
  END IF;

  -- 4) If status is 'paid' or 'void', no-op (idempotent)
  IF v_invoice.status IN ('paid', 'void') THEN
    RETURN QUERY
    SELECT
      v_invoice.id,
      v_invoice.job_id,
      v_invoice.invoice_number,
      v_invoice.status,
      v_invoice.due_date,
      v_invoice.balance_due,
      v_invoice.last_status_eval_at,
      v_invoice.updated_at;
    RETURN;
  END IF;

  -- 5) Check if overdue: due_date is not null AND due_date < now() AND balance_due > 0
  v_is_overdue := (
    v_invoice.due_date IS NOT NULL
    AND v_invoice.due_date < now()
    AND COALESCE(v_invoice.balance_due, 0) > 0
  );

  -- 6) Update status if overdue
  IF v_is_overdue AND v_invoice.status != 'overdue' THEN
    UPDATE public.invoices
    SET
      status = 'overdue',
      last_status_eval_at = now(),
      updated_at = now()
    WHERE id = p_invoice_id;
  ELSE
    -- Update last_status_eval_at even if not overdue (track evaluation)
    UPDATE public.invoices
    SET
      last_status_eval_at = now(),
      updated_at = now()
    WHERE id = p_invoice_id;
  END IF;

  -- 7) Return updated invoice
  RETURN QUERY
  SELECT
    i.id,
    i.job_id,
    i.invoice_number,
    i.status,
    i.due_date,
    i.balance_due,
    i.last_status_eval_at,
    i.updated_at
  FROM public.invoices i
  WHERE i.id = p_invoice_id;
END;
$$;

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION public.eval_invoice_overdue(uuid) TO authenticated;

-- =============================================================================
-- D) RPC: eval_invoices_overdue_for_company (batch)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.eval_invoices_overdue_for_company(p_limit int DEFAULT 500)
RETURNS TABLE (
  updated_count int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_role text;
  v_count int := 0;
BEGIN
  -- 1) Require authentication (or allow service role for scheduled jobs)
  v_user_id := auth.uid();
  
  -- If called from service role (scheduled job), skip role check
  IF v_user_id IS NOT NULL THEN
    SELECT p.company_id, p.role INTO v_company_id, v_role
    FROM public.profiles p
    WHERE p.id = v_user_id;

    IF v_company_id IS NULL THEN
      RAISE EXCEPTION 'NO_COMPANY';
    END IF;

    -- Only admin/manager/dispatcher can manually evaluate (or service role)
    IF v_role NOT IN ('admin', 'manager', 'dispatcher') THEN
      RAISE EXCEPTION 'FORBIDDEN' USING
        MESSAGE = 'Only admins, managers, and dispatchers can evaluate invoice status';
    END IF;
  ELSE
    -- Service role: use current_company_id() if available, otherwise skip tenant filter
    v_company_id := public.current_company_id();
  END IF;

  -- 2) Update overdue invoices in bulk
  WITH overdue_invoices AS (
    UPDATE public.invoices
    SET
      status = 'overdue',
      last_status_eval_at = now(),
      updated_at = now()
    WHERE
      status NOT IN ('paid', 'void')
      AND due_date IS NOT NULL
      AND due_date < now()
      AND COALESCE(balance_due, 0) > 0
      AND (v_company_id IS NULL OR company_id = v_company_id)
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count
  FROM overdue_invoices;

  -- 3) Return count
  RETURN QUERY
  SELECT v_count;
END;
$$;

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION public.eval_invoices_overdue_for_company(int) TO authenticated;

COMMIT;
