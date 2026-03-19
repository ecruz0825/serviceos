-- =============================================================================
-- CFO Cash Forecast Hardening
-- =============================================================================
-- Hardens the cash forecast RPC with parameter validation and consistent
-- draft exclusion. Ensures all calculations use the same base filter.
--
-- Changes:
-- 1) Parameter validation: clamp p_days to 1-365, default p_as_of to now()
-- 2) Draft exclusion consistency: sent_at IS NOT NULL applied everywhere
-- 3) Same return shape: no breaking changes to frontend
-- =============================================================================

BEGIN;

-- =============================================================================
-- RPC: get_cash_forecast_for_company (Hardened)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_cash_forecast_for_company(
  p_as_of timestamptz DEFAULT now(),
  p_days int DEFAULT 30
)
RETURNS TABLE (
  as_of timestamptz,
  horizon_days int,
  expected_collections numeric,
  optimistic_collections numeric,
  pessimistic_collections numeric,
  bucket_0_7 numeric,
  bucket_8_14 numeric,
  bucket_15_30 numeric,
  bucket_31_60 numeric,
  bucket_61_90 numeric,
  bucket_90_plus numeric,
  open_invoice_count int,
  overdue_invoice_count int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_role text;
  v_as_of timestamptz;
  v_days int;
  v_bucket_0_7 numeric;
  v_bucket_8_14 numeric;
  v_bucket_15_30 numeric;
  v_bucket_31_60 numeric;
  v_bucket_61_90 numeric;
  v_bucket_90_plus numeric;
  v_expected_collections numeric;
  v_optimistic_collections numeric;
  v_pessimistic_collections numeric;
  v_open_invoice_count int;
  v_overdue_invoice_count int;
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

  -- 3) Only admin/manager/dispatcher can view cash forecast
  IF v_role NOT IN ('admin', 'manager', 'dispatcher') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING
      MESSAGE = 'Only admins, managers, and dispatchers can view cash forecast';
  END IF;

  -- 4) Parameter validation and defaults
  v_as_of := COALESCE(p_as_of, now());
  v_days := COALESCE(p_days, 30);
  -- Clamp p_days to 1-365
  v_days := GREATEST(1, LEAST(v_days, 365));

  -- 5) Base filter: invoices that are "live" (sent) and have balance due
  -- This filter is applied consistently across all calculations
  -- Base conditions:
  --   - company_id = v_company_id (tenant isolation)
  --   - sent_at IS NOT NULL (exclude drafts)
  --   - status NOT IN ('paid','void') (exclude closed invoices)
  --   - balance_due > 0 (only outstanding amounts)

  -- 6) Calculate buckets by days_past_due
  -- Bucket 0-7 days (includes NULL due_date as 0 days)
  SELECT COALESCE(SUM(balance_due), 0)
  INTO v_bucket_0_7
  FROM public.invoices i
  WHERE i.company_id = v_company_id
    AND i.sent_at IS NOT NULL
    AND i.status NOT IN ('paid', 'void')
    AND COALESCE(i.balance_due, 0) > 0
    AND (
      i.due_date IS NULL
      OR GREATEST(0, DATE_PART('day', v_as_of - i.due_date)::int) BETWEEN 0 AND 7
    );

  -- Bucket 8-14 days
  SELECT COALESCE(SUM(balance_due), 0)
  INTO v_bucket_8_14
  FROM public.invoices i
  WHERE i.company_id = v_company_id
    AND i.sent_at IS NOT NULL
    AND i.status NOT IN ('paid', 'void')
    AND COALESCE(i.balance_due, 0) > 0
    AND i.due_date IS NOT NULL
    AND GREATEST(0, DATE_PART('day', v_as_of - i.due_date)::int) BETWEEN 8 AND 14;

  -- Bucket 15-30 days
  SELECT COALESCE(SUM(balance_due), 0)
  INTO v_bucket_15_30
  FROM public.invoices i
  WHERE i.company_id = v_company_id
    AND i.sent_at IS NOT NULL
    AND i.status NOT IN ('paid', 'void')
    AND COALESCE(i.balance_due, 0) > 0
    AND i.due_date IS NOT NULL
    AND GREATEST(0, DATE_PART('day', v_as_of - i.due_date)::int) BETWEEN 15 AND 30;

  -- Bucket 31-60 days
  SELECT COALESCE(SUM(balance_due), 0)
  INTO v_bucket_31_60
  FROM public.invoices i
  WHERE i.company_id = v_company_id
    AND i.sent_at IS NOT NULL
    AND i.status NOT IN ('paid', 'void')
    AND COALESCE(i.balance_due, 0) > 0
    AND i.due_date IS NOT NULL
    AND GREATEST(0, DATE_PART('day', v_as_of - i.due_date)::int) BETWEEN 31 AND 60;

  -- Bucket 61-90 days
  SELECT COALESCE(SUM(balance_due), 0)
  INTO v_bucket_61_90
  FROM public.invoices i
  WHERE i.company_id = v_company_id
    AND i.sent_at IS NOT NULL
    AND i.status NOT IN ('paid', 'void')
    AND COALESCE(i.balance_due, 0) > 0
    AND i.due_date IS NOT NULL
    AND GREATEST(0, DATE_PART('day', v_as_of - i.due_date)::int) BETWEEN 61 AND 90;

  -- Bucket 90+ days
  SELECT COALESCE(SUM(balance_due), 0)
  INTO v_bucket_90_plus
  FROM public.invoices i
  WHERE i.company_id = v_company_id
    AND i.sent_at IS NOT NULL
    AND i.status NOT IN ('paid', 'void')
    AND COALESCE(i.balance_due, 0) > 0
    AND i.due_date IS NOT NULL
    AND GREATEST(0, DATE_PART('day', v_as_of - i.due_date)::int) > 90;

  -- 7) Calculate expected collections using probability curve
  v_expected_collections :=
    (COALESCE(v_bucket_0_7, 0) * 0.70) +
    (COALESCE(v_bucket_8_14, 0) * 0.55) +
    (COALESCE(v_bucket_15_30, 0) * 0.40) +
    (COALESCE(v_bucket_31_60, 0) * 0.25) +
    (COALESCE(v_bucket_61_90, 0) * 0.15) +
    (COALESCE(v_bucket_90_plus, 0) * 0.10);

  -- 8) Calculate optimistic and pessimistic scenarios
  v_optimistic_collections := v_expected_collections * 1.15;
  v_pessimistic_collections := v_expected_collections * 0.85;

  -- 9) Count open invoices (using same base filter)
  SELECT COUNT(*)
  INTO v_open_invoice_count
  FROM public.invoices i
  WHERE i.company_id = v_company_id
    AND i.sent_at IS NOT NULL
    AND i.status NOT IN ('paid', 'void')
    AND COALESCE(i.balance_due, 0) > 0;

  -- 10) Count overdue invoices (base filter + due_date < v_as_of)
  SELECT COUNT(*)
  INTO v_overdue_invoice_count
  FROM public.invoices i
  WHERE i.company_id = v_company_id
    AND i.sent_at IS NOT NULL
    AND i.status NOT IN ('paid', 'void')
    AND COALESCE(i.balance_due, 0) > 0
    AND i.due_date IS NOT NULL
    AND i.due_date < v_as_of;

  -- 11) Return results
  RETURN QUERY
  SELECT
    v_as_of,
    v_days,
    v_expected_collections,
    v_optimistic_collections,
    v_pessimistic_collections,
    v_bucket_0_7,
    v_bucket_8_14,
    v_bucket_15_30,
    v_bucket_31_60,
    v_bucket_61_90,
    v_bucket_90_plus,
    v_open_invoice_count,
    v_overdue_invoice_count;
END;
$$;

-- Ensure GRANT is in place (idempotent)
GRANT EXECUTE ON FUNCTION public.get_cash_forecast_for_company(timestamptz, int) TO authenticated;

COMMIT;
