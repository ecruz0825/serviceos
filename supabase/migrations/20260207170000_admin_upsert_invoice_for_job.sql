BEGIN;

-- =============================================================================
-- admin_upsert_invoice_for_job RPC
-- Creates or updates invoice row when admin generates invoice PDF
-- =============================================================================

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

  -- 6) Upsert invoice
  IF v_existing_invoice_id IS NOT NULL THEN
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

  -- 7) Return invoice ID
  RETURN v_invoice_id;
END;
$$;

-- Grant execute to authenticated (RLS will enforce admin-only via role check)
GRANT EXECUTE ON FUNCTION public.admin_upsert_invoice_for_job(uuid, text, numeric, numeric, numeric) TO authenticated;

COMMIT;
