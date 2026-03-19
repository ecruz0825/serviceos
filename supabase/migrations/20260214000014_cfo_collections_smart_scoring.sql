-- =============================================================================
-- CFO Collections Smart Scoring Engine (Phase C4)
-- =============================================================================
-- Enhances get_collections_queue_for_company with intelligent scoring:
-- - promise_breached flag (promise date passed, still overdue)
-- - days_since_last_action (staleness indicator)
-- - Recalculated priority_score with operational bonuses
-- =============================================================================

BEGIN;

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
  suggested_action text,
  last_action_at timestamptz,
  last_action_type text,
  promise_breached boolean,
  days_since_last_action int
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

  -- 4) Return prioritized collections queue with smart scoring
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
  ),
  customer_last_action AS (
    SELECT DISTINCT ON (cal.customer_id)
      cal.customer_id,
      cal.created_at AS last_action_at,
      cal.action_type AS last_action_type
    FROM public.collections_actions_log cal
    WHERE cal.company_id = v_company_id
    ORDER BY cal.customer_id, cal.created_at DESC
  ),
  customer_last_promise AS (
    SELECT DISTINCT ON (cal.customer_id)
      cal.customer_id,
      cal.promise_date,
      cal.created_at AS promise_created_at
    FROM public.collections_actions_log cal
    WHERE cal.company_id = v_company_id
      AND cal.action_type = 'promise_to_pay'
      AND cal.promise_date IS NOT NULL
    ORDER BY cal.customer_id, cal.created_at DESC
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
    -- Recalculated priority score with smart bonuses
    (
      GREATEST(0,
        (COALESCE(ca.overdue_balance, 0) * 1.0)
        + (COALESCE(ca.total_balance_due, 0) * 0.25)
        + (COALESCE(ca.days_past_due_max, 0) * 10)
        - (CASE WHEN cp.last_payment_at >= p_as_of - interval '14 days' THEN 200 ELSE 0 END)
      )
      + (CASE 
          WHEN cla.last_action_type = 'promise_to_pay'
            AND clp.promise_date IS NOT NULL
            AND clp.promise_date < p_as_of::date
            AND COALESCE(ca.overdue_balance, 0) > 0
          THEN 25::numeric
          ELSE 0::numeric
        END)
      + (CASE 
          WHEN cla.last_action_at IS NOT NULL
            AND DATE_PART('day', p_as_of - cla.last_action_at)::int >= 7
          THEN 10::numeric
          ELSE 0::numeric
        END)
      + (CASE 
          WHEN COALESCE(ca.overdue_balance, 0) > 500
          THEN 15::numeric
          ELSE 0::numeric
        END)
      + ((COALESCE(ca.days_past_due_max, 0)::numeric / 30.0) * 5.0)
    )::numeric AS priority_score,
    -- Suggested action
    CASE
      WHEN COALESCE(ca.overdue_balance, 0) >= 500 AND COALESCE(ca.days_past_due_max, 0) >= 30 THEN 'Call + send final notice'
      WHEN COALESCE(ca.overdue_balance, 0) > 0 AND COALESCE(ca.days_past_due_max, 0) >= 14 THEN 'Call + resend invoice'
      WHEN COALESCE(ca.overdue_balance, 0) > 0 THEN 'Send reminder'
      ELSE 'Monitor'
    END AS suggested_action,
    -- Last action fields
    cla.last_action_at,
    cla.last_action_type,
    -- Smart scoring fields (new)
    (
      cla.last_action_type = 'promise_to_pay'
      AND clp.promise_date IS NOT NULL
      AND clp.promise_date < p_as_of::date
      AND COALESCE(ca.overdue_balance, 0) > 0
    ) AS promise_breached,
    CASE
      WHEN cla.last_action_at IS NOT NULL THEN
        DATE_PART('day', p_as_of - cla.last_action_at)::int
      ELSE NULL
    END AS days_since_last_action
  FROM customer_ar ca
  LEFT JOIN public.customers c ON c.id = ca.customer_id AND c.company_id = v_company_id
  LEFT JOIN customer_payments cp ON cp.customer_id = ca.customer_id
  LEFT JOIN customer_payment_history cph ON cph.customer_id = ca.customer_id
  LEFT JOIN customer_last_action cla ON cla.customer_id = ca.customer_id
  LEFT JOIN customer_last_promise clp ON clp.customer_id = ca.customer_id
  ORDER BY priority_score DESC, ca.oldest_due_date ASC NULLS LAST
  LIMIT p_limit;
END;
$$;

-- Grant execute to authenticated (role check enforced inside function)
GRANT EXECUTE ON FUNCTION public.get_collections_queue_for_company(int, timestamptz) TO authenticated;

COMMIT;
