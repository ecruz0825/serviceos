-- =============================================================================
-- Fix Collections Queue avg_days_to_pay Return Type
-- =============================================================================
-- Ensures avg_days_to_pay returns numeric (not double precision) to match
-- the function's return type declaration.
-- =============================================================================

BEGIN;

-- Drop and recreate the function with explicit numeric casting for avg_days_to_pay
DROP FUNCTION IF EXISTS public.get_collections_queue_for_company(integer, timestamptz);

CREATE OR REPLACE FUNCTION public.get_collections_queue_for_company(
  p_limit int DEFAULT 25,
  p_as_of timestamptz DEFAULT now()
)
RETURNS TABLE (
  customer_id uuid,
  customer_name text,
  open_invoice_count int,
  total_balance_due numeric,
  oldest_due_date timestamptz,
  days_past_due_max int,
  overdue_balance numeric,
  last_payment_at timestamptz,
  avg_days_to_pay numeric,
  priority_score numeric,
  suggested_action text
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

  -- 3) Only admin/manager/dispatcher can view collections queue
  IF v_role NOT IN ('admin', 'manager', 'dispatcher') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING
      MESSAGE = 'Only admins, managers, and dispatchers can view collections queue';
  END IF;

  -- 4) Return prioritized collections queue
  RETURN QUERY
  WITH customer_ar AS (
    SELECT
      i.customer_id,
      COUNT(*)::int AS open_invoice_count,
      SUM(i.balance_due) AS total_balance_due,
      MIN(i.due_date) FILTER (WHERE i.due_date IS NOT NULL) AS oldest_due_date,
      MAX(GREATEST(0, DATE_PART('day', p_as_of - i.due_date)::int)) FILTER (WHERE i.due_date IS NOT NULL) AS days_past_due_max,
      SUM(i.balance_due) FILTER (WHERE i.due_date IS NOT NULL AND i.due_date < p_as_of) AS overdue_balance
    FROM public.invoices i
    WHERE i.company_id = v_company_id
      AND i.status NOT IN ('paid', 'void')
      AND COALESCE(i.balance_due, 0) > 0
      AND i.sent_at IS NOT NULL
    GROUP BY i.customer_id
  ),
  customer_payments AS (
    SELECT
      j.customer_id,
      MAX(p.paid_at) AS last_payment_at
    FROM public.payments p
    INNER JOIN public.jobs j ON j.id = p.job_id
    WHERE p.company_id = v_company_id
      AND p.status = 'posted'
      AND p.paid_at IS NOT NULL
    GROUP BY j.customer_id
  ),
  customer_payment_history AS (
    SELECT
      i.customer_id,
      (COALESCE(AVG(DATE_PART('day', i.paid_at - i.sent_at)), 0))::numeric AS avg_days_to_pay
    FROM public.invoices i
    WHERE i.company_id = v_company_id
      AND i.status = 'paid'
      AND i.paid_at IS NOT NULL
      AND i.sent_at IS NOT NULL
    GROUP BY i.customer_id
  )
  SELECT
    ca.customer_id,
    COALESCE(
      NULLIF(c.full_name, ''),
      NULLIF(c.email, ''),
      'Unknown Customer'
    ) AS customer_name,
    ca.open_invoice_count,
    COALESCE(ca.total_balance_due, 0) AS total_balance_due,
    ca.oldest_due_date,
    COALESCE(ca.days_past_due_max, 0)::int AS days_past_due_max,
    COALESCE(ca.overdue_balance, 0) AS overdue_balance,
    cp.last_payment_at,
    COALESCE(cph.avg_days_to_pay, 0)::numeric AS avg_days_to_pay,
    -- Priority score calculation
    GREATEST(0,
      (COALESCE(ca.overdue_balance, 0) * 1.0)
      + (COALESCE(ca.total_balance_due, 0) * 0.25)
      + (COALESCE(ca.days_past_due_max, 0) * 10)
      - (CASE WHEN cp.last_payment_at >= p_as_of - interval '14 days' THEN 200 ELSE 0 END)
    ) AS priority_score,
    -- Suggested action
    CASE
      WHEN COALESCE(ca.overdue_balance, 0) >= 500 AND COALESCE(ca.days_past_due_max, 0) >= 30 THEN 'Call + send final notice'
      WHEN COALESCE(ca.overdue_balance, 0) > 0 AND COALESCE(ca.days_past_due_max, 0) >= 14 THEN 'Call + resend invoice'
      WHEN COALESCE(ca.overdue_balance, 0) > 0 THEN 'Send reminder'
      ELSE 'Monitor'
    END AS suggested_action
  FROM customer_ar ca
  LEFT JOIN public.customers c ON c.id = ca.customer_id AND c.company_id = v_company_id
  LEFT JOIN customer_payments cp ON cp.customer_id = ca.customer_id
  LEFT JOIN customer_payment_history cph ON cph.customer_id = ca.customer_id
  ORDER BY priority_score DESC, ca.oldest_due_date ASC NULLS LAST
  LIMIT p_limit;
END;
$$;

-- Grant execute to authenticated (role check enforced inside function)
GRANT EXECUTE ON FUNCTION public.get_collections_queue_for_company(int, timestamptz) TO authenticated;

COMMIT;
