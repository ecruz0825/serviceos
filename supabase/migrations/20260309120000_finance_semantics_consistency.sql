BEGIN;

-- ============================================================================
-- Finance Semantics Consistency Hardening
-- ============================================================================
-- Align CFO cash collection calculations to consistently exclude voided payments.
-- This is a no-shape-change patch (same function signatures/return columns).
-- ============================================================================

-- 1) Financial snapshot: collected_window should exclude voided payments
CREATE OR REPLACE FUNCTION public.get_financial_snapshot_for_company(
  p_window_days int DEFAULT 30,
  p_expected_days int DEFAULT 14
)
RETURNS TABLE (
  outstanding_ar numeric,
  overdue_ar numeric,
  expected_next_days numeric,
  collected_window numeric,
  avg_days_to_pay numeric,
  sent_count int,
  overdue_count int,
  paid_count int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_role text;
  v_outstanding_ar numeric;
  v_overdue_ar numeric;
  v_expected_next_days numeric;
  v_collected_window numeric;
  v_avg_days_to_pay numeric;
  v_sent_count int;
  v_overdue_count int;
  v_paid_count int;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT p.company_id, p.role INTO v_company_id, v_role
  FROM public.profiles p
  WHERE p.id = v_user_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'NO_COMPANY';
  END IF;

  IF v_role NOT IN ('admin', 'manager', 'dispatcher') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING
      MESSAGE = 'Only admins, managers, and dispatchers can view financial snapshot';
  END IF;

  SELECT COALESCE(SUM(balance_due), 0)
  INTO v_outstanding_ar
  FROM public.invoices
  WHERE company_id = v_company_id
    AND status NOT IN ('paid', 'void')
    AND COALESCE(balance_due, 0) > 0;

  SELECT COALESCE(SUM(balance_due), 0)
  INTO v_overdue_ar
  FROM public.invoices
  WHERE company_id = v_company_id
    AND status = 'overdue'
    AND COALESCE(balance_due, 0) > 0;

  SELECT COALESCE(SUM(balance_due), 0)
  INTO v_expected_next_days
  FROM public.invoices
  WHERE company_id = v_company_id
    AND status IN ('sent', 'overdue', 'draft')
    AND COALESCE(balance_due, 0) > 0
    AND due_date IS NOT NULL
    AND due_date <= now() + (p_expected_days || ' days')::interval;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_collected_window
  FROM public.payments
  WHERE company_id = v_company_id
    AND status = 'posted'
    AND voided_at IS NULL
    AND paid_at >= now() - (p_window_days || ' days')::interval;

  SELECT COALESCE(
    AVG(EXTRACT(EPOCH FROM (paid_at - sent_at)) / 86400.0),
    0
  )
  INTO v_avg_days_to_pay
  FROM public.invoices
  WHERE company_id = v_company_id
    AND status = 'paid'
    AND paid_at IS NOT NULL
    AND sent_at IS NOT NULL
    AND paid_at >= now() - (p_window_days || ' days')::interval;

  SELECT COUNT(*)
  INTO v_sent_count
  FROM public.invoices
  WHERE company_id = v_company_id
    AND status = 'sent';

  SELECT COUNT(*)
  INTO v_overdue_count
  FROM public.invoices
  WHERE company_id = v_company_id
    AND status = 'overdue';

  SELECT COUNT(*)
  INTO v_paid_count
  FROM public.invoices
  WHERE company_id = v_company_id
    AND status = 'paid';

  RETURN QUERY
  SELECT
    v_outstanding_ar,
    v_overdue_ar,
    v_expected_next_days,
    v_collected_window,
    v_avg_days_to_pay,
    v_sent_count,
    v_overdue_count,
    v_paid_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_financial_snapshot_for_company(int, int) TO authenticated;

-- 2) CFO trends: collected_total should exclude voided payments
CREATE OR REPLACE FUNCTION public.get_cfo_trends_for_company(
  p_months int DEFAULT 6
)
RETURNS TABLE (
  period_start date,
  sent_invoices_count int,
  sent_invoices_total numeric,
  collected_total numeric,
  overdue_balance_end numeric,
  outstanding_balance_end numeric,
  dso_days numeric
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
  v_month_start date;
  v_month_end date;
  v_next_month_start date;
  v_sent_count int;
  v_sent_total numeric;
  v_collected numeric;
  v_overdue_balance numeric;
  v_outstanding_balance numeric;
  v_trailing_3mo_total numeric;
  v_trailing_3mo_avg_per_day numeric;
  v_dso_days numeric;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT p.company_id, p.role INTO v_company_id, v_role
  FROM public.profiles p
  WHERE p.id = v_user_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'NO_COMPANY';
  END IF;

  IF v_role NOT IN ('admin', 'manager', 'dispatcher') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING
      MESSAGE = 'Only admins, managers, and dispatchers can view CFO trends';
  END IF;

  v_months := COALESCE(p_months, 6);
  v_months := GREATEST(1, LEAST(v_months, 24));

  FOR v_month_start IN
    SELECT (date_trunc('month', now()) - (s || ' months')::interval)::date
    FROM generate_series(0, v_months - 1) s
    ORDER BY (date_trunc('month', now()) - (s || ' months')::interval)::date
  LOOP
    v_month_end := (v_month_start + interval '1 month - 1 day')::date;
    v_next_month_start := (v_month_start + interval '1 month')::date;

    SELECT
      COUNT(*),
      COALESCE(SUM(total), 0)
    INTO v_sent_count, v_sent_total
    FROM public.invoices i
    WHERE i.company_id = v_company_id
      AND i.sent_at IS NOT NULL
      AND i.sent_at >= v_month_start
      AND i.sent_at < v_next_month_start;

    SELECT COALESCE(SUM(p.amount), 0)
    INTO v_collected
    FROM public.payments p
    WHERE p.company_id = v_company_id
      AND p.status = 'posted'
      AND p.voided_at IS NULL
      AND p.paid_at IS NOT NULL
      AND p.paid_at >= v_month_start
      AND p.paid_at < v_next_month_start;

    SELECT COALESCE(SUM(i.balance_due), 0)
    INTO v_outstanding_balance
    FROM public.invoices i
    WHERE i.company_id = v_company_id
      AND i.sent_at IS NOT NULL
      AND i.sent_at <= v_month_end
      AND i.status NOT IN ('paid', 'void')
      AND COALESCE(i.balance_due, 0) > 0;

    SELECT COALESCE(SUM(i.balance_due), 0)
    INTO v_overdue_balance
    FROM public.invoices i
    WHERE i.company_id = v_company_id
      AND i.sent_at IS NOT NULL
      AND i.status NOT IN ('paid', 'void')
      AND COALESCE(i.balance_due, 0) > 0
      AND i.due_date IS NOT NULL
      AND i.due_date < v_month_end;

    SELECT COALESCE(SUM(i.total), 0)
    INTO v_trailing_3mo_total
    FROM public.invoices i
    WHERE i.company_id = v_company_id
      AND i.sent_at IS NOT NULL
      AND i.sent_at >= (v_month_start - interval '3 months')
      AND i.sent_at < v_next_month_start;

    v_trailing_3mo_avg_per_day := v_trailing_3mo_total / 90.0;

    IF v_trailing_3mo_avg_per_day > 0 THEN
      v_dso_days := v_outstanding_balance / v_trailing_3mo_avg_per_day;
    ELSE
      v_dso_days := 0;
    END IF;

    RETURN QUERY
    SELECT
      v_month_start,
      COALESCE(v_sent_count, 0)::int,
      COALESCE(v_sent_total, 0),
      COALESCE(v_collected, 0),
      COALESCE(v_overdue_balance, 0),
      COALESCE(v_outstanding_balance, 0),
      COALESCE(v_dso_days, 0);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cfo_trends_for_company(int) TO authenticated;

COMMIT;
