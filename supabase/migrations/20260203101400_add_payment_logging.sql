BEGIN;

-- =============================================================================
-- Add timeline logging to payment RPCs (record_payment and void_payment)
-- =============================================================================

-- Update record_payment to log customer activity
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
  v_customer_id uuid;
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

  -- Store customer_id for logging
  v_customer_id := v_job.customer_id;

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

  -- Log payment recorded activity (if customer_id exists)
  IF v_customer_id IS NOT NULL THEN
    BEGIN
      PERFORM public.log_customer_activity(
        v_customer_id,
        'payment.recorded',
        'Payment recorded',
        '$' || p_amount::text || ' payment recorded via ' || p_method,
        v_payment_id,
        jsonb_build_object(
          'payment_id', v_payment_id,
          'job_id', p_job_id,
          'amount', p_amount,
          'method', p_method,
          'total_paid', v_new_total,
          'balance_due', GREATEST(v_allowed - v_new_total, 0)
        ),
        'payments',
        'payment',
        'success'
      );
    EXCEPTION WHEN OTHERS THEN
      -- Log error but don't fail the transaction
      RAISE WARNING 'Failed to log payment recorded activity: %', SQLERRM;
    END;
  END IF;

  payment_id := v_payment_id;
  job_id := p_job_id;
  job_cost := v_allowed;
  total_paid := v_new_total;
  balance_due := GREATEST(v_allowed - v_new_total, 0);
  external_ref := p_external_ref;
  receipt_number := v_receipt_number::text;
  received_by := v_received_by;

  RETURN NEXT;
END;
$$;

-- Update void_payment to log customer activity
CREATE OR REPLACE FUNCTION public.void_payment(
  p_payment_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_role text;
  v_company_id uuid;
  v_payment record;
  v_customer_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT p.role, p.company_id INTO v_role, v_company_id
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_role <> 'admin' THEN
    RAISE EXCEPTION 'ADMIN_ONLY';
  END IF;

  SELECT *
  INTO v_payment
  FROM public.payments pay
  WHERE pay.id = p_payment_id
    AND pay.company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_NOT_FOUND';
  END IF;

  -- Get customer_id from job
  SELECT j.customer_id INTO v_customer_id
  FROM public.jobs j
  WHERE j.id = v_payment.job_id
    AND j.company_id = v_company_id;

  UPDATE public.payments
  SET status = 'voided',
      voided_at = now(),
      void_reason = COALESCE(p_reason,'(no reason provided)')
  WHERE id = p_payment_id;

  -- Log payment voided activity (if customer_id exists)
  IF v_customer_id IS NOT NULL THEN
    BEGIN
      PERFORM public.log_customer_activity(
        v_customer_id,
        'payment.voided',
        'Payment voided',
        '$' || v_payment.amount::text || ' payment voided: ' || COALESCE(p_reason, 'no reason provided'),
        p_payment_id,
        jsonb_build_object(
          'payment_id', p_payment_id,
          'job_id', v_payment.job_id,
          'amount', v_payment.amount,
          'method', v_payment.payment_method,
          'reason', COALESCE(p_reason, 'no reason provided')
        ),
        'payments',
        'payment',
        'warning'
      );
    EXCEPTION WHEN OTHERS THEN
      -- Log error but don't fail the transaction
      RAISE WARNING 'Failed to log payment voided activity: %', SQLERRM;
    END;
  END IF;
END;
$$;

COMMIT;
