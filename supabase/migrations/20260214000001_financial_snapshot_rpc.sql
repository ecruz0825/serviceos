-- =============================================================================
-- Financial Snapshot RPC (CFO Cockpit Phase A)
-- =============================================================================
-- Provides AR + cash metrics for a company via a single DB-first RPC.
-- Frontend only renders returned numbers (no client-side calculations).
-- =============================================================================

BEGIN;

-- =============================================================================
-- RPC: get_financial_snapshot_for_company
-- =============================================================================

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

  -- 3) Only admin/manager/dispatcher can view financial snapshot
  IF v_role NOT IN ('admin', 'manager', 'dispatcher') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING
      MESSAGE = 'Only admins, managers, and dispatchers can view financial snapshot';
  END IF;

  -- 4) Outstanding AR: SUM(balance_due) where status NOT IN ('paid','void') AND balance_due > 0
  SELECT COALESCE(SUM(balance_due), 0)
  INTO v_outstanding_ar
  FROM public.invoices
  WHERE company_id = v_company_id
    AND status NOT IN ('paid', 'void')
    AND COALESCE(balance_due, 0) > 0;

  -- 5) Overdue AR: SUM(balance_due) where status='overdue' AND balance_due > 0
  SELECT COALESCE(SUM(balance_due), 0)
  INTO v_overdue_ar
  FROM public.invoices
  WHERE company_id = v_company_id
    AND status = 'overdue'
    AND COALESCE(balance_due, 0) > 0;

  -- 6) Expected Next N Days: SUM(balance_due) where status IN ('sent','overdue','draft') 
  --    AND balance_due > 0 AND due_date <= now() + p_expected_days
  SELECT COALESCE(SUM(balance_due), 0)
  INTO v_expected_next_days
  FROM public.invoices
  WHERE company_id = v_company_id
    AND status IN ('sent', 'overdue', 'draft')
    AND COALESCE(balance_due, 0) > 0
    AND due_date IS NOT NULL
    AND due_date <= now() + (p_expected_days || ' days')::interval;

  -- 7) Collected Last N Days: SUM(amount) from payments where status='posted' 
  --    AND paid_at >= now() - p_window_days
  SELECT COALESCE(SUM(amount), 0)
  INTO v_collected_window
  FROM public.payments
  WHERE company_id = v_company_id
    AND status = 'posted'
    AND paid_at >= now() - (p_window_days || ' days')::interval;

  -- 8) Avg Days To Pay: average of (paid_at - sent_at) in DAYS
  --    for invoices where status='paid' AND paid_at >= now() - p_window_days
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

  -- 9) Sent count: COUNT(*) where status='sent'
  SELECT COUNT(*)
  INTO v_sent_count
  FROM public.invoices
  WHERE company_id = v_company_id
    AND status = 'sent';

  -- 10) Overdue count: COUNT(*) where status='overdue'
  SELECT COUNT(*)
  INTO v_overdue_count
  FROM public.invoices
  WHERE company_id = v_company_id
    AND status = 'overdue';

  -- 11) Paid count: COUNT(*) where status='paid'
  SELECT COUNT(*)
  INTO v_paid_count
  FROM public.invoices
  WHERE company_id = v_company_id
    AND status = 'paid';

  -- 12) Return results
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

-- Grant execute to authenticated (role check enforced inside function)
GRANT EXECUTE ON FUNCTION public.get_financial_snapshot_for_company(int, int) TO authenticated;

COMMIT;
