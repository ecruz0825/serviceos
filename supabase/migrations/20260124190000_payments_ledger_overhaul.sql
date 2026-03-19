-- =============================================================================
-- Payments Ledger Overhaul (Professional Standard)
-- - Server-side enforcement via RPCs
-- - Role-based RLS (admin/crew/customer)
-- - Append-only payments with void capability
-- - Overpayment attempts logged
-- =============================================================================

BEGIN;

-- 1) Add professional audit / ledger columns to payments
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS paid_at timestamptz DEFAULT now() NOT NULL,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'posted' NOT NULL,
  ADD COLUMN IF NOT EXISTS created_by uuid DEFAULT auth.uid(),
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS void_reason text;

-- Keep legacy columns for compatibility, but constrain them sanely
-- amount should be required and positive
ALTER TABLE public.payments
  ALTER COLUMN amount SET NOT NULL;

-- If you want strict cents precision, uncomment the next line after confirming no bad data:
-- ALTER TABLE public.payments ALTER COLUMN amount TYPE numeric(12,2) USING round(amount::numeric, 2);

-- Add CHECK constraints in separate statements (Supabase/Postgres syntax requirement)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_amount_positive'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_amount_positive CHECK (amount > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_status_check'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_status_check CHECK (status IN ('posted','voided'));
  END IF;
END$$;

-- Legacy paid flag is not a true ledger concept; keep it but default to true for compatibility
ALTER TABLE public.payments
  ALTER COLUMN paid SET DEFAULT true;

-- Ensure date_paid exists for legacy screens; keep it aligned on insert
ALTER TABLE public.payments
  ALTER COLUMN date_paid SET DEFAULT CURRENT_DATE;

-- 2) Helper: current_user_role()
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

-- 3) Helper: crew_member_id_for_current_user()
CREATE OR REPLACE FUNCTION public.current_crew_member_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT cm.id
  FROM public.crew_members cm
  WHERE cm.user_id = auth.uid()
  LIMIT 1
$$;

-- 4) RPC: record_payment (enforces tenant, role, assignment, overpayment)
CREATE OR REPLACE FUNCTION public.record_payment(
  p_job_id uuid,
  p_amount numeric,
  p_method text,
  p_notes text DEFAULT NULL
)
RETURNS TABLE (
  payment_id uuid,
  job_id uuid,
  job_cost numeric,
  total_paid numeric,
  balance_due numeric
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
    created_by
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
    auth.uid()
  )
  RETURNING id INTO payment_id;

  job_id := p_job_id;
  job_cost := v_allowed;
  total_paid := v_new_total;
  balance_due := GREATEST(v_allowed - v_new_total, 0);

  RETURN NEXT;
END;
$$;

-- 5) RPC: void_payment (admin only; does not delete)
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

  UPDATE public.payments
  SET status = 'voided',
      voided_at = now(),
      void_reason = COALESCE(p_reason,'(no reason provided)')
  WHERE id = p_payment_id;
END;
$$;

-- 6) RLS hardening for payments
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Drop permissive tenant CRUD policies (if they exist)
DROP POLICY IF EXISTS payments_select_tenant ON public.payments;
DROP POLICY IF EXISTS payments_insert_tenant ON public.payments;
DROP POLICY IF EXISTS payments_update_tenant ON public.payments;
DROP POLICY IF EXISTS payments_delete_tenant ON public.payments;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS payments_select_admin ON public.payments;
DROP POLICY IF EXISTS payments_select_crew_assigned ON public.payments;
DROP POLICY IF EXISTS payments_select_customer_own_jobs ON public.payments;

-- SELECT: admin can see all company payments
CREATE POLICY payments_select_admin
ON public.payments
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_user_role() = 'admin'
);

-- SELECT: crew can see payments for jobs assigned to them
CREATE POLICY payments_select_crew_assigned
ON public.payments
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_user_role() = 'crew'
  AND EXISTS (
    SELECT 1
    FROM public.jobs j
    WHERE j.id = payments.job_id
      AND j.company_id = payments.company_id
      AND j.assigned_to = public.current_crew_member_id()
  )
);

-- SELECT: customer can see payments for jobs tied to their customer record
CREATE POLICY payments_select_customer_own_jobs
ON public.payments
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_user_role() = 'customer'
  AND EXISTS (
    SELECT 1
    FROM public.jobs j
    JOIN public.customers c ON c.id = j.customer_id
    WHERE j.id = payments.job_id
      AND j.company_id = payments.company_id
      AND c.user_id = auth.uid()
  )
);

-- INSERT: do not allow direct inserts; payments must go through record_payment()
-- (No INSERT policy intentionally.)

-- UPDATE/DELETE: do not allow direct updates/deletes; void via RPC
-- (No UPDATE/DELETE policy intentionally.)

COMMIT;

