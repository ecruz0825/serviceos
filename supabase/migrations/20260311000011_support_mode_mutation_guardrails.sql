BEGIN;

-- =============================================================================
-- Support Mode Mutation Guardrails (Phase 2A)
-- =============================================================================
-- Adds support mode rejection checks to critical mutation RPCs.
-- Prevents platform_admin in support mode from performing mutations.
--
-- RPCs patched:
-- - record_payment()
-- - create_or_get_invoice_for_job()
-- - admin_upsert_invoice_for_job()
-- - send_invoice()
--
-- Behavior:
-- - Early reject with SUPPORT_MODE_READ_ONLY exception if in support mode
-- - Do not change non-support-mode behavior
-- =============================================================================

-- =============================================================================
-- 1) Patch: record_payment()
-- =============================================================================
-- Add support mode check after role validation

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

  -- Support mode check: reject mutations in support mode
  IF public.is_support_mode() THEN
    RAISE EXCEPTION 'SUPPORT_MODE_READ_ONLY' USING
      MESSAGE = 'Payment recording is disabled in support mode';
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

  INSERT INTO public.payments (
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
  RETURNING id, external_ref, receipt_number, received_by INTO v_payment_id, v_external_ref, v_receipt_number, v_received_by;

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

-- =============================================================================
-- 2) Patch: create_or_get_invoice_for_job()
-- =============================================================================
-- Add support mode check after role validation

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

  -- Support mode check: reject mutations in support mode
  IF public.is_support_mode() THEN
    RAISE EXCEPTION 'SUPPORT_MODE_READ_ONLY' USING
      MESSAGE = 'Invoice creation is disabled in support mode';
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

-- =============================================================================
-- 3) Patch: admin_upsert_invoice_for_job()
-- =============================================================================
-- Add support mode check after role validation

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

  -- Support mode check: reject mutations in support mode
  IF public.is_support_mode() THEN
    RAISE EXCEPTION 'SUPPORT_MODE_READ_ONLY' USING
      MESSAGE = 'Invoice updates are disabled in support mode';
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

-- =============================================================================
-- 4) Patch: send_invoice()
-- =============================================================================
-- Add support mode check after role validation

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

  -- Support mode check: reject mutations in support mode
  IF public.is_support_mode() THEN
    RAISE EXCEPTION 'SUPPORT_MODE_READ_ONLY' USING
      MESSAGE = 'Invoice sending is disabled in support mode';
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

-- =============================================================================
-- Note: seed_demo_data() and purge_demo_data() RPCs
-- =============================================================================
-- These RPCs are not found in the migrations directory. If they exist elsewhere
-- or are created later, they should also be patched with support mode checks.
-- For now, they are handled via frontend guardrails only.

-- =============================================================================
-- RLS Policy Verification
-- =============================================================================
-- Verify that direct write policies for these tables remain mutation-blocking
-- for platform_admin. The following tables should have INSERT/UPDATE/DELETE
-- policies that require current_user_role() = 'admin' (not is_admin_or_support_mode()):
--
-- - jobs: Should block INSERT/UPDATE/DELETE for platform_admin
-- - customers: Should block INSERT/UPDATE/DELETE for platform_admin
-- - companies: Should block UPDATE for platform_admin
-- - customer_notes: Should block INSERT/DELETE for platform_admin
-- - customer_files: Should block INSERT/UPDATE/DELETE for platform_admin
-- - payment_receipts: Should block INSERT/UPDATE/DELETE for platform_admin
-- - invoices: Should block INSERT/UPDATE/DELETE for platform_admin
--
-- These policies are NOT modified in this migration. They should already be
-- blocking mutations for platform_admin. If any mutation policy incorrectly
-- allows support mode, it should be tightened separately.

COMMIT;
