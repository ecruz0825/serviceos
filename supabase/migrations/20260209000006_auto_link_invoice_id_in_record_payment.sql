BEGIN;

-- =============================================================================
-- Auto-link invoice_id for crew-recorded payments when invoice exists
-- =============================================================================
-- When p_invoice_id is NULL, automatically look up the invoice for the job
-- and use it if found. This enables invoice status/balance automation
-- without requiring the frontend to pass invoice_id.
--
-- Logic:
-- - If p_invoice_id IS NULL:
--   - Look up invoice by job_id + company_id (LIMIT 1)
--   - Use that id as invoice_id if found
-- - Preserve all existing validation and tenant isolation
-- =============================================================================

CREATE OR REPLACE FUNCTION public.record_payment(
  p_job_id uuid,
  p_amount numeric,
  p_method text,
  p_notes text DEFAULT NULL,
  p_external_ref text DEFAULT NULL,
  p_invoice_id uuid DEFAULT NULL
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
#variable_conflict use_variable
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
  v_invoice record;
  v_invoice_id uuid;
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

  -- Auto-link invoice_id if not provided and invoice exists for this job
  v_invoice_id := p_invoice_id;
  IF v_invoice_id IS NULL THEN
    SELECT i.id
    INTO v_invoice_id
    FROM public.invoices i
    WHERE i.job_id = p_job_id
      AND i.company_id = v_company_id
    LIMIT 1;
  END IF;

  -- If invoice_id is provided (or auto-linked), validate it exists and matches company + job
  IF v_invoice_id IS NOT NULL THEN
    SELECT *
    INTO v_invoice
    FROM public.invoices i
    WHERE i.id = v_invoice_id
      AND i.company_id = v_company_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVOICE_NOT_FOUND';
    END IF;

    -- Validate invoice belongs to the same job
    IF v_invoice.job_id <> p_job_id THEN
      RAISE EXCEPTION 'INVOICE_JOB_MISMATCH';
    END IF;
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

  -- Crew can only record payments for jobs assigned to their team
  -- Use team-based assignment if available, fall back to assigned_to for backward compatibility
  IF v_role = 'crew' THEN
    v_crew_member_id := public.current_crew_member_id();
    IF v_crew_member_id IS NULL THEN
      RAISE EXCEPTION 'CREW_NOT_LINKED';
    END IF;

    -- Check if job uses team-based assignment
    IF v_job.assigned_team_id IS NOT NULL THEN
      -- Team-based: verify crew member is on the assigned team
      IF NOT EXISTS (
        SELECT 1
        FROM public.team_members tm
        WHERE tm.team_id = v_job.assigned_team_id
          AND tm.crew_member_id = v_crew_member_id
      ) THEN
        RAISE EXCEPTION 'forbidden_job_not_assigned_to_team';
      END IF;
    ELSE
      -- Legacy: fall back to assigned_to check
      IF v_job.assigned_to IS NULL OR v_job.assigned_to <> v_crew_member_id THEN
        RAISE EXCEPTION 'JOB_NOT_ASSIGNED_TO_CREW';
      END IF;
    END IF;
  END IF;

  SELECT COALESCE(SUM(pmt.amount), 0)
  INTO v_paid_so_far
  FROM public.payments pmt
  WHERE pmt.job_id = p_job_id
    AND pmt.company_id = v_company_id
    AND pmt.status = 'posted';

  v_new_total := v_paid_so_far + p_amount;
  v_allowed := COALESCE(v_job.job_cost, 0);

  -- Block overpayment (and log attempt)
  IF v_allowed > 0 AND v_new_total > v_allowed THEN
    INSERT INTO public.overpayments_log (job_id, crew_id, entered_amount, allowed_amount, company_id)
    VALUES (
      p_job_id,
      COALESCE(v_crew_member_id, public.current_crew_member_id()),
      p_amount,
      GREATEST(v_allowed - v_paid_so_far, 0),
      v_company_id
    );

    RAISE EXCEPTION 'OVERPAYMENT';
  END IF;

  -- Insert payment with explicit column names matching payments table schema
  INSERT INTO public.payments AS pmt (
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
    received_by,
    external_ref,
    invoice_id
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
    auth.uid(),
    p_external_ref,
    v_invoice_id  -- Use auto-linked invoice_id if found
  )
  RETURNING
    pmt.id,
    pmt.external_ref,
    pmt.receipt_number,
    pmt.received_by
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
        'job_id', p_job_id,
        'invoice_id', v_invoice_id  -- Log the invoice_id (may be auto-linked)
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

-- Ensure grants are in place
GRANT EXECUTE ON FUNCTION public.record_payment(uuid, numeric, text, text, text, uuid) TO authenticated;

COMMIT;
