-- =============================================================================
-- CFO Trends Timeseries RPC (Phase C2)
-- =============================================================================
-- Provides monthly trends for DSO, collections, and new AR.
-- All calculations DB-first (no client-side aggregation).
--
-- Metrics:
-- - DSO (Days Sales Outstanding): outstanding AR / trailing 3-month avg daily sales
-- - Collections: payments posted per month
-- - New AR: invoices sent per month
-- - Balance trends: outstanding and overdue AR at month-end
-- =============================================================================

BEGIN;

-- =============================================================================
-- RPC: get_cfo_trends_for_company
-- =============================================================================

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

  -- 3) Only admin/manager/dispatcher can view trends
  IF v_role NOT IN ('admin', 'manager', 'dispatcher') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING
      MESSAGE = 'Only admins, managers, and dispatchers can view CFO trends';
  END IF;

  -- 4) Parameter validation: clamp p_months to 1-24
  v_months := COALESCE(p_months, 6);
  v_months := GREATEST(1, LEAST(v_months, 24));

  -- 5) Generate month series and compute metrics for each month
  FOR v_month_start IN
    SELECT (date_trunc('month', now()) - (s || ' months')::interval)::date
    FROM generate_series(0, v_months - 1) s
    ORDER BY (date_trunc('month', now()) - (s || ' months')::interval)::date
  LOOP
    v_month_end := (v_month_start + interval '1 month - 1 day')::date;
    v_next_month_start := (v_month_start + interval '1 month')::date;

    -- 6) Count and sum invoices sent in this month
    SELECT
      COUNT(*),
      COALESCE(SUM(total), 0)
    INTO v_sent_count, v_sent_total
    FROM public.invoices i
    WHERE i.company_id = v_company_id
      AND i.sent_at IS NOT NULL
      AND i.sent_at >= v_month_start
      AND i.sent_at < v_next_month_start;

    -- 7) Sum payments collected in this month
    SELECT COALESCE(SUM(p.amount), 0)
    INTO v_collected
    FROM public.payments p
    WHERE p.company_id = v_company_id
      AND p.status = 'posted'
      AND p.paid_at IS NOT NULL
      AND p.paid_at >= v_month_start
      AND p.paid_at < v_next_month_start;

    -- 8) Outstanding balance as of month-end
    -- Includes all invoices sent by month-end that are not paid/void
    SELECT COALESCE(SUM(i.balance_due), 0)
    INTO v_outstanding_balance
    FROM public.invoices i
    WHERE i.company_id = v_company_id
      AND i.sent_at IS NOT NULL
      AND i.sent_at <= v_month_end
      AND i.status NOT IN ('paid', 'void')
      AND COALESCE(i.balance_due, 0) > 0;

    -- 9) Overdue balance as of month-end
    -- Includes invoices that are overdue (due_date < month_end) and not paid/void
    SELECT COALESCE(SUM(i.balance_due), 0)
    INTO v_overdue_balance
    FROM public.invoices i
    WHERE i.company_id = v_company_id
      AND i.sent_at IS NOT NULL
      AND i.status NOT IN ('paid', 'void')
      AND COALESCE(i.balance_due, 0) > 0
      AND i.due_date IS NOT NULL
      AND i.due_date < v_month_end;

    -- 10) Calculate trailing 3-month average daily sales for DSO
    -- Sum of sent_invoices_total over last 3 months, divided by 90 days
    SELECT COALESCE(SUM(i.total), 0)
    INTO v_trailing_3mo_total
    FROM public.invoices i
    WHERE i.company_id = v_company_id
      AND i.sent_at IS NOT NULL
      AND i.sent_at >= (v_month_start - interval '3 months')
      AND i.sent_at < v_next_month_start;

    v_trailing_3mo_avg_per_day := v_trailing_3mo_total / 90.0;

    -- 11) Calculate DSO (Days Sales Outstanding)
    -- DSO = outstanding_balance_end / trailing_3mo_avg_per_day
    IF v_trailing_3mo_avg_per_day > 0 THEN
      v_dso_days := v_outstanding_balance / v_trailing_3mo_avg_per_day;
    ELSE
      v_dso_days := 0;
    END IF;

    -- 12) Return row for this month
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

-- Grant execute to authenticated (role check enforced inside function)
GRANT EXECUTE ON FUNCTION public.get_cfo_trends_for_company(int) TO authenticated;

COMMIT;
