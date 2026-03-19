BEGIN;

-- =============================================================================
-- Customer Portal RPCs and RLS Policies (Phase 4)
-- Enables customer access to quotes, invoices, and optimized data loading
-- =============================================================================

-- 1) Enable quotes RLS policy for customers (currently commented out)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'quotes'
      AND policyname = 'quotes_select_customer_own'
  ) THEN
    CREATE POLICY quotes_select_customer_own
    ON public.quotes
    FOR SELECT
    TO authenticated
    USING (
      company_id = public.current_company_id()
      AND public.current_company_id() IS NOT NULL
      AND public.current_user_role() = 'customer'
      AND EXISTS (
        SELECT 1
        FROM public.customers c
        WHERE c.id = quotes.customer_id
          AND c.company_id = quotes.company_id
          AND c.user_id = auth.uid()
      )
    );
  END IF;
END $$;

-- 2) Add invoices RLS policy for customers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'invoices'
      AND policyname = 'invoices_select_customer_own'
  ) THEN
    CREATE POLICY invoices_select_customer_own
    ON public.invoices
    FOR SELECT
    TO authenticated
    USING (
      company_id = public.current_company_id()
      AND public.current_company_id() IS NOT NULL
      AND public.current_user_role() = 'customer'
      AND EXISTS (
        SELECT 1
        FROM public.customers c
        WHERE c.id = invoices.customer_id
          AND c.company_id = invoices.company_id
          AND c.user_id = auth.uid()
      )
    );
  END IF;
END $$;

-- 3) Add customer_feedback RLS policy (if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'customer_feedback' 
      AND policyname = 'customer_feedback_select_own'
  ) THEN
    CREATE POLICY customer_feedback_select_own
    ON public.customer_feedback
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.customers c
        WHERE c.id = customer_feedback.customer_id
          AND c.user_id = auth.uid()
      )
    );
  END IF;
END $$;

-- 4) RPC: get_customer_dashboard_summary
CREATE OR REPLACE FUNCTION public.get_customer_dashboard_summary(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_role text;
  v_customer record;
  v_total_jobs int;
  v_open_quotes int;
  v_outstanding_balance numeric;
  v_upcoming_jobs int;
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

  -- 2) Get caller profile
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

  -- 3) Only customer role can access
  IF v_role != 'customer' THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'FORBIDDEN',
      'message', 'Only customers can access this function'
    );
  END IF;

  -- 4) Verify customer belongs to caller
  SELECT c.* INTO v_customer
  FROM public.customers c
  WHERE c.id = p_customer_id
    AND c.company_id = v_company_id
    AND c.user_id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'error',
      'error', 'CUSTOMER_NOT_FOUND',
      'message', 'Customer not found or access denied'
    );
  END IF;

  -- 5) Calculate totals
  SELECT COUNT(*) INTO v_total_jobs
  FROM public.jobs j
  WHERE j.customer_id = p_customer_id
    AND j.company_id = v_company_id;

  SELECT COUNT(*) INTO v_open_quotes
  FROM public.quotes q
  WHERE q.customer_id = p_customer_id
    AND q.company_id = v_company_id
    AND q.status IN ('draft', 'sent');

  -- Calculate outstanding balance
  SELECT COALESCE(SUM(j.job_cost), 0) - COALESCE(SUM(p.amount), 0)
  INTO v_outstanding_balance
  FROM public.jobs j
  LEFT JOIN public.payments p ON p.job_id = j.id
    AND p.company_id = j.company_id
    AND p.status = 'posted'
  WHERE j.customer_id = p_customer_id
    AND j.company_id = v_company_id;

  v_outstanding_balance := GREATEST(COALESCE(v_outstanding_balance, 0), 0);

  -- Count upcoming jobs
  SELECT COUNT(*) INTO v_upcoming_jobs
  FROM public.jobs j
  WHERE j.customer_id = p_customer_id
    AND j.company_id = v_company_id
    AND j.service_date >= CURRENT_DATE
    AND j.status != 'completed'
    AND (j.completed IS NULL OR j.completed = false);

  -- 6) Return summary
  RETURN jsonb_build_object(
    'status', 'success',
    'total_jobs', v_total_jobs,
    'open_quotes', v_open_quotes,
    'outstanding_balance', v_outstanding_balance,
    'upcoming_jobs', v_upcoming_jobs
  );
END;
$$;

-- 5) RPC: get_customer_jobs
CREATE OR REPLACE FUNCTION public.get_customer_jobs(p_customer_id uuid)
RETURNS TABLE (
  id uuid,
  services_performed text,
  status text,
  job_cost numeric,
  notes text,
  service_date date,
  before_image text,
  after_image text,
  invoice_path text,
  invoice_uploaded_at timestamptz,
  completed boolean,
  completed_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_role text;
  v_customer record;
BEGIN
  -- 1) Require authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- 2) Get caller profile
  SELECT p.company_id, p.role INTO v_company_id, v_role
  FROM public.profiles p
  WHERE p.id = v_user_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'NO_COMPANY';
  END IF;

  -- 3) Only customer role can access
  IF v_role != 'customer' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  -- 4) Verify customer belongs to caller
  SELECT c.* INTO v_customer
  FROM public.customers c
  WHERE c.id = p_customer_id
    AND c.company_id = v_company_id
    AND c.user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CUSTOMER_NOT_FOUND';
  END IF;

  -- 5) Return jobs
  RETURN QUERY
  SELECT
    j.id,
    j.services_performed,
    j.status,
    j.job_cost,
    j.notes,
    j.service_date,
    j.before_image,
    j.after_image,
    j.invoice_path,
    j.invoice_uploaded_at,
    j.completed,
    j.completed_at,
    j.created_at
  FROM public.jobs j
  WHERE j.customer_id = p_customer_id
    AND j.company_id = v_company_id
  ORDER BY j.service_date DESC NULLS LAST, j.created_at DESC;
END;
$$;

-- 6) RPC: get_customer_quotes
CREATE OR REPLACE FUNCTION public.get_customer_quotes(p_customer_id uuid)
RETURNS TABLE (
  id uuid,
  quote_number text,
  services jsonb,
  subtotal numeric,
  tax numeric,
  total numeric,
  status text,
  notes text,
  created_at timestamptz,
  sent_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  expires_at timestamptz,
  valid_until date,
  converted_job_id uuid,
  public_token uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_role text;
  v_customer record;
BEGIN
  -- 1) Require authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- 2) Get caller profile
  SELECT p.company_id, p.role INTO v_company_id, v_role
  FROM public.profiles p
  WHERE p.id = v_user_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'NO_COMPANY';
  END IF;

  -- 3) Only customer role can access
  IF v_role != 'customer' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  -- 4) Verify customer belongs to caller
  SELECT c.* INTO v_customer
  FROM public.customers c
  WHERE c.id = p_customer_id
    AND c.company_id = v_company_id
    AND c.user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CUSTOMER_NOT_FOUND';
  END IF;

  -- 5) Return quotes
  RETURN QUERY
  SELECT
    q.id,
    q.quote_number,
    q.services,
    q.subtotal,
    q.tax,
    q.total,
    q.status::text,
    q.notes,
    q.created_at,
    q.sent_at,
    q.accepted_at,
    q.rejected_at,
    q.expires_at,
    q.valid_until,
    q.converted_job_id,
    q.public_token
  FROM public.quotes q
  WHERE q.customer_id = p_customer_id
    AND q.company_id = v_company_id
  ORDER BY q.created_at DESC;
END;
$$;

-- 7) RPC: get_customer_invoices
CREATE OR REPLACE FUNCTION public.get_customer_invoices(p_customer_id uuid)
RETURNS TABLE (
  id uuid,
  invoice_number text,
  job_id uuid,
  status text,
  total numeric,
  balance_due numeric,
  due_date timestamptz,
  created_at timestamptz,
  invoice_pdf_path text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_role text;
  v_customer record;
BEGIN
  -- 1) Require authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- 2) Get caller profile
  SELECT p.company_id, p.role INTO v_company_id, v_role
  FROM public.profiles p
  WHERE p.id = v_user_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'NO_COMPANY';
  END IF;

  -- 3) Only customer role can access
  IF v_role != 'customer' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  -- 4) Verify customer belongs to caller
  SELECT c.* INTO v_customer
  FROM public.customers c
  WHERE c.id = p_customer_id
    AND c.company_id = v_company_id
    AND c.user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CUSTOMER_NOT_FOUND';
  END IF;

  -- 5) Return invoices (from invoices table if available, else fallback to jobs)
  RETURN QUERY
  SELECT
    i.id,
    i.invoice_number,
    i.job_id,
    i.status::text,
    i.total,
    i.balance_due,
    i.due_date,
    i.created_at,
    i.invoice_pdf_path
  FROM public.invoices i
  WHERE i.customer_id = p_customer_id
    AND i.company_id = v_company_id
  ORDER BY i.created_at DESC;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_customer_dashboard_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_jobs(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_quotes(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_invoices(uuid) TO authenticated;

COMMIT;
