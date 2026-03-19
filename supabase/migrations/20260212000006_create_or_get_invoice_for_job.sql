-- =============================================================================
-- Create or Get Invoice for Job RPC (Canonical Invoice Pipeline Step 1)
-- =============================================================================
-- DB-first entrypoint for creating or fetching an invoice for a job.
-- This becomes the single canonical way to create invoices (no direct inserts).
--
-- Features:
-- - Idempotent: returns existing invoice if one exists for the job
-- - Uses existing invoice_counters table and assign_invoice_number() trigger
-- - Enforces tenant isolation and role restrictions
-- - Computes totals from job.job_cost
-- - Returns full invoice row (not just ID)
-- =============================================================================

BEGIN;

-- =============================================================================
-- RPC: create_or_get_invoice_for_job
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_or_get_invoice_for_job(
  p_job_id uuid,
  p_due_date timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  company_id uuid,
  customer_id uuid,
  job_id uuid,
  invoice_number text,
  status public.invoice_status,
  subtotal numeric,
  tax numeric,
  total numeric,
  balance_due numeric,
  pdf_path text,
  sent_at timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,
  due_date timestamptz,
  created_at timestamptz,
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
  v_job record;
  v_customer_id uuid;
  v_job_cost numeric;
  v_subtotal numeric;
  v_tax numeric;
  v_total numeric;
  v_balance_due numeric;
  v_invoice_id uuid;
  v_existing_invoice record;
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

  -- 3) Only admin/manager/dispatcher can create invoices
  IF v_role NOT IN ('admin', 'manager', 'dispatcher') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING
      MESSAGE = 'Only admins, managers, and dispatchers can create invoices';
  END IF;

  -- 4) Lock job row and validate it exists and belongs to company
  SELECT j.* INTO v_job
  FROM public.jobs j
  WHERE j.id = p_job_id
    AND j.company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND';
  END IF;

  -- 5) Extract values from job
  v_customer_id := v_job.customer_id;
  v_job_cost := COALESCE(v_job.job_cost, 0);

  -- 6) Check if invoice already exists for this job (idempotent)
  SELECT i.* INTO v_existing_invoice
  FROM public.invoices i
  WHERE i.job_id = p_job_id
    AND i.company_id = v_company_id
  FOR UPDATE;

  -- 7) If invoice exists, return it (idempotent behavior)
  IF v_existing_invoice.id IS NOT NULL THEN
    RETURN QUERY
    SELECT
      v_existing_invoice.id,
      v_existing_invoice.company_id,
      v_existing_invoice.customer_id,
      v_existing_invoice.job_id,
      v_existing_invoice.invoice_number,
      v_existing_invoice.status,
      v_existing_invoice.subtotal,
      v_existing_invoice.tax,
      v_existing_invoice.total,
      v_existing_invoice.balance_due,
      v_existing_invoice.pdf_path,
      v_existing_invoice.sent_at,
      v_existing_invoice.paid_at,
      v_existing_invoice.voided_at,
      v_existing_invoice.due_date,
      v_existing_invoice.created_at,
      v_existing_invoice.updated_at,
      v_existing_invoice.metadata;
    RETURN;
  END IF;

  -- 8) Compute invoice totals
  v_subtotal := v_job_cost;
  v_tax := 0; -- Default to 0 (can be extended later with company tax settings)
  v_total := v_subtotal + v_tax; -- For now, total = subtotal (tax is 0)
  
  -- Compute balance_due from payments
  SELECT COALESCE(SUM(p.amount), 0)
  INTO v_balance_due
  FROM public.payments p
  WHERE p.job_id = p_job_id
    AND p.company_id = v_company_id
    AND p.status = 'posted'
    AND (p.voided_at IS NULL);

  v_balance_due := GREATEST(v_total - v_balance_due, 0);

  -- 9) Create new invoice
  -- Note: invoice_number will be auto-assigned by assign_invoice_number() trigger
  INSERT INTO public.invoices (
    company_id,
    customer_id,
    job_id,
    invoice_number, -- NULL triggers auto-assignment
    status,
    subtotal,
    tax,
    total,
    balance_due,
    due_date,
    metadata
  )
  VALUES (
    v_company_id,
    v_customer_id,
    p_job_id,
    NULL, -- Trigger will assign invoice number
    'draft', -- Default status
    v_subtotal,
    v_tax,
    v_total,
    v_balance_due,
    p_due_date,
    jsonb_build_object(
      'source', 'rpc',
      'created_by', v_user_id,
      'created_via', 'create_or_get_invoice_for_job'
    )
  )
  RETURNING invoices.id INTO v_invoice_id;

  -- 10) Return the newly created invoice
  RETURN QUERY
  SELECT
    i.id,
    i.company_id,
    i.customer_id,
    i.job_id,
    i.invoice_number,
    i.status,
    i.subtotal,
    i.tax,
    i.total,
    i.balance_due,
    i.pdf_path,
    i.sent_at,
    i.paid_at,
    i.voided_at,
    i.due_date,
    i.created_at,
    i.updated_at,
    i.metadata
  FROM public.invoices i
  WHERE i.id = v_invoice_id;
END;
$$;

-- Grant execute to authenticated (RLS and role checks enforce security)
GRANT EXECUTE ON FUNCTION public.create_or_get_invoice_for_job(uuid, timestamptz) TO authenticated;

-- =============================================================================
-- Fix admin_upsert_invoice_for_job: Remove issued_at references
-- =============================================================================
-- This RPC is still used by JobsAdmin, but it references issued_at which doesn't exist.
-- Update it to use sent_at instead and ensure it uses pdf_path (canonical).

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

  -- 3) Only admin can call this (legacy RPC, kept for backward compatibility)
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
    -- Update existing invoice (use pdf_path, not invoice_pdf_path; trigger will sync)
    UPDATE public.invoices
    SET
      pdf_path = p_pdf_path,
      subtotal = p_subtotal,
      tax = p_tax,
      total = p_total,
      sent_at = COALESCE(sent_at, now()), -- Set sent_at if not already set (replaces issued_at)
      updated_at = now()
    WHERE id = v_existing_invoice_id
    RETURNING id INTO v_invoice_id;
  ELSE
    -- Insert new invoice (status = 'draft' for newly created)
    -- invoice_number will be auto-assigned by trigger
    INSERT INTO public.invoices (
      company_id,
      customer_id,
      job_id,
      pdf_path,
      subtotal,
      tax,
      total,
      status
    )
    VALUES (
      v_company_id,
      v_customer_id,
      p_job_id,
      p_pdf_path,
      p_subtotal,
      p_tax,
      p_total,
      'draft'
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

COMMIT;
