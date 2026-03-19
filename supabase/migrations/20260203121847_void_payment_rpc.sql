BEGIN;

-- Update void_payment RPC to:
-- 1. Validate payment status is 'posted' (not already voided)
-- 2. Validate reason is not null/empty
-- 3. Log to customer timeline
-- 4. Return payment id

-- Drop existing function first to allow return type change
DROP FUNCTION IF EXISTS public.void_payment(uuid, text);

CREATE FUNCTION public.void_payment(
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

  RETURN p_payment_id;
END;
$$;

COMMIT;
