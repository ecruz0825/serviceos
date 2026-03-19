-- =============================================================================
-- Profit Trends RPC (CFO Cockpit Milestone 5)
-- =============================================================================
-- Provides monthly cash-basis expense and profit trends for the current company.
-- Metrics per month:
-- - expense_total: sum of recorded expenses
-- - collected_total: sum of posted, non-voided payments
-- - net_profit: collected_total - expense_total
-- - profit_margin: net_profit / collected_total (0 when collected_total = 0)
-- =============================================================================

BEGIN;

-- =============================================================================
-- RPC: get_profit_trends_for_company
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_profit_trends_for_company(
  p_months int DEFAULT 6
)
RETURNS TABLE (
  period_start date,
  expense_total numeric,
  collected_total numeric,
  net_profit numeric,
  profit_margin numeric
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
  v_next_month_start date;
  v_expense_total numeric;
  v_collected_total numeric;
  v_net_profit numeric;
  v_profit_margin numeric;
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

  -- 3) Only admin/manager/dispatcher can view profit trends
  IF v_role NOT IN ('admin', 'manager', 'dispatcher') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING
      MESSAGE = 'Only admins, managers, and dispatchers can view profit trends';
  END IF;

  -- 4) Parameter validation: clamp p_months to 1-24
  v_months := COALESCE(p_months, 6);
  v_months := GREATEST(1, LEAST(v_months, 24));

  -- 5) Generate month series and compute metrics for each month (ASC)
  FOR v_month_start IN
    SELECT (date_trunc('month', now()) - (s || ' months')::interval)::date
    FROM generate_series(0, v_months - 1) s
    ORDER BY (date_trunc('month', now()) - (s || ' months')::interval)::date
  LOOP
    v_next_month_start := (v_month_start + interval '1 month')::date;

    -- 6) Expense total for month
    SELECT COALESCE(SUM(e.amount), 0)
    INTO v_expense_total
    FROM public.expenses e
    WHERE e.company_id = v_company_id
      AND e.date >= v_month_start
      AND e.date < v_next_month_start;

    -- 7) Collected total for month (cash-basis)
    SELECT COALESCE(SUM(p.amount), 0)
    INTO v_collected_total
    FROM public.payments p
    WHERE p.company_id = v_company_id
      AND p.status = 'posted'
      AND p.voided_at IS NULL
      AND p.date_paid >= v_month_start
      AND p.date_paid < v_next_month_start;

    -- 8) Net profit
    v_net_profit := COALESCE(v_collected_total, 0) - COALESCE(v_expense_total, 0);

    -- 9) Profit margin
    v_profit_margin := CASE
      WHEN COALESCE(v_collected_total, 0) = 0 THEN 0
      ELSE v_net_profit / v_collected_total
    END;

    -- 10) Return row for this month
    RETURN QUERY
    SELECT
      v_month_start,
      COALESCE(v_expense_total, 0),
      COALESCE(v_collected_total, 0),
      COALESCE(v_net_profit, 0),
      COALESCE(v_profit_margin, 0);
  END LOOP;
END;
$$;

-- Grant execute to authenticated (role check enforced inside function)
GRANT EXECUTE ON FUNCTION public.get_profit_trends_for_company(int) TO authenticated;

COMMIT;
