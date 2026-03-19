-- =============================================================================
-- Profit Snapshot RPC (CFO Cockpit Milestone 5)
-- =============================================================================
-- Provides a cash-basis profit snapshot for a selected date range.
-- Revenue: posted, non-voided payments in period.
-- Expenses: recorded expenses in period.
-- Net Profit: revenue - expenses.
-- Profit Margin: (revenue - expenses) / revenue (or 0 when revenue = 0).
-- =============================================================================

BEGIN;

-- =============================================================================
-- RPC: get_profit_snapshot_for_company
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_profit_snapshot_for_company(
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  revenue numeric,
  expenses numeric,
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
  v_revenue numeric;
  v_expenses numeric;
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

  -- 3) Only admin/manager/dispatcher can view profit snapshot
  IF v_role NOT IN ('admin', 'manager', 'dispatcher') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING
      MESSAGE = 'Only admins, managers, and dispatchers can view profit snapshot';
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

  -- 5) Revenue: posted, non-voided payments in selected period
  SELECT COALESCE(SUM(p.amount), 0)
  INTO v_revenue
  FROM public.payments p
  WHERE p.company_id = v_company_id
    AND p.status = 'posted'
    AND p.voided_at IS NULL
    AND p.date_paid BETWEEN p_start_date AND p_end_date;

  -- 6) Expenses: recorded expenses in selected period
  SELECT COALESCE(SUM(e.amount), 0)
  INTO v_expenses
  FROM public.expenses e
  WHERE e.company_id = v_company_id
    AND e.date BETWEEN p_start_date AND p_end_date;

  -- 7) Net Profit
  v_net_profit := v_revenue - v_expenses;

  -- 8) Profit Margin
  v_profit_margin := CASE
    WHEN v_revenue = 0 THEN 0
    ELSE v_net_profit / v_revenue
  END;

  -- 9) Return results
  RETURN QUERY
  SELECT
    v_revenue,
    v_expenses,
    v_net_profit,
    v_profit_margin;
END;
$$;

-- Grant execute to authenticated (role check enforced inside function)
GRANT EXECUTE ON FUNCTION public.get_profit_snapshot_for_company(date, date) TO authenticated;

COMMIT;
