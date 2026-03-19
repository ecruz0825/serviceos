-- =============================================================================
-- Revenue Hub Reporting RPCs (Milestone 5)
-- =============================================================================
-- Adds first reporting RPCs for:
-- 1) Revenue by Customer (cash basis)
-- 2) Revenue by Month (cash basis)
-- 3) Expenses by Category
-- =============================================================================

BEGIN;

-- =============================================================================
-- RPC 1: get_revenue_by_customer_for_company
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_revenue_by_customer_for_company(
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  customer_id uuid,
  customer_name text,
  collected_total numeric,
  payment_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_role text;
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

  -- 3) Only admin/manager/dispatcher can view revenue reports
  IF v_role NOT IN ('admin', 'manager', 'dispatcher') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING
      MESSAGE = 'Only admins, managers, and dispatchers can view revenue reports';
  END IF;

  -- 4) Validate date range
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'INVALID_DATE_RANGE' USING
      MESSAGE = 'p_start_date and p_end_date are required';
  END IF;

  IF p_start_date > p_end_date THEN
    RAISE EXCEPTION 'INVALID_DATE_RANGE' USING
      MESSAGE = 'p_start_date cannot be after p_end_date';
  END IF;

  -- 5) Cash-basis customer aggregation from posted, non-voided payments
  RETURN QUERY
  SELECT
    c.id AS customer_id,
    c.full_name AS customer_name,
    COALESCE(SUM(p.amount), 0) AS collected_total,
    COUNT(*)::bigint AS payment_count
  FROM public.payments p
  INNER JOIN public.jobs j
    ON j.id = p.job_id
   AND j.company_id = v_company_id
  INNER JOIN public.customers c
    ON c.id = j.customer_id
   AND c.company_id = v_company_id
  WHERE p.company_id = v_company_id
    AND p.status = 'posted'
    AND p.voided_at IS NULL
    AND p.date_paid BETWEEN p_start_date AND p_end_date
  GROUP BY c.id, c.full_name
  ORDER BY COALESCE(SUM(p.amount), 0) DESC, c.full_name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_revenue_by_customer_for_company(date, date) TO authenticated;

-- =============================================================================
-- RPC 2: get_revenue_by_month_for_company
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_revenue_by_month_for_company(
  p_months int DEFAULT 12
)
RETURNS TABLE (
  period_start date,
  collected_total numeric,
  payment_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_role text;
  v_months int;
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

  -- 3) Only admin/manager/dispatcher can view revenue reports
  IF v_role NOT IN ('admin', 'manager', 'dispatcher') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING
      MESSAGE = 'Only admins, managers, and dispatchers can view revenue reports';
  END IF;

  -- 4) Parameter validation: clamp p_months to 1-36
  v_months := COALESCE(p_months, 12);
  v_months := GREATEST(1, LEAST(v_months, 36));

  -- 5) Generate month buckets and zero-fill
  RETURN QUERY
  WITH month_series AS (
    SELECT (date_trunc('month', now()) - (s || ' months')::interval)::date AS month_start
    FROM generate_series(0, v_months - 1) s
  ),
  monthly_payments AS (
    SELECT
      ms.month_start AS period_start,
      COALESCE(SUM(p.amount), 0) AS collected_total,
      COALESCE(COUNT(p.id), 0)::bigint AS payment_count
    FROM month_series ms
    LEFT JOIN public.payments p
      ON p.company_id = v_company_id
     AND p.status = 'posted'
     AND p.voided_at IS NULL
     AND p.date_paid >= ms.month_start
     AND p.date_paid < (ms.month_start + interval '1 month')::date
    GROUP BY ms.month_start
  )
  SELECT
    mp.period_start,
    COALESCE(mp.collected_total, 0) AS collected_total,
    COALESCE(mp.payment_count, 0)::bigint AS payment_count
  FROM monthly_payments mp
  ORDER BY mp.period_start ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_revenue_by_month_for_company(int) TO authenticated;

-- =============================================================================
-- RPC 3: get_expenses_by_category_for_company
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_expenses_by_category_for_company(
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  category text,
  expense_total numeric,
  expense_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_role text;
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

  -- 3) Only admin/manager/dispatcher can view revenue reports
  IF v_role NOT IN ('admin', 'manager', 'dispatcher') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING
      MESSAGE = 'Only admins, managers, and dispatchers can view revenue reports';
  END IF;

  -- 4) Validate date range
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'INVALID_DATE_RANGE' USING
      MESSAGE = 'p_start_date and p_end_date are required';
  END IF;

  IF p_start_date > p_end_date THEN
    RAISE EXCEPTION 'INVALID_DATE_RANGE' USING
      MESSAGE = 'p_start_date cannot be after p_end_date';
  END IF;

  -- 5) Category aggregation with safe category normalization
  RETURN QUERY
  SELECT
    CASE
      WHEN e.category IS NULL OR btrim(e.category) = '' THEN 'Uncategorized'
      ELSE e.category
    END AS category,
    COALESCE(SUM(e.amount), 0) AS expense_total,
    COUNT(*)::bigint AS expense_count
  FROM public.expenses e
  WHERE e.company_id = v_company_id
    AND e.date BETWEEN p_start_date AND p_end_date
  GROUP BY
    CASE
      WHEN e.category IS NULL OR btrim(e.category) = '' THEN 'Uncategorized'
      ELSE e.category
    END
  ORDER BY COALESCE(SUM(e.amount), 0) DESC, category ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_expenses_by_category_for_company(date, date) TO authenticated;

COMMIT;
