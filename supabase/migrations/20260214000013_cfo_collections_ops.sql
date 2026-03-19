-- =============================================================================
-- CFO Collections Operations (Audit Trail + Actions)
-- =============================================================================
-- Adds operational capabilities to Collections Queue:
-- - Immutable audit log of collection actions
-- - RPC to log actions (contacted, promise to pay, resolved, etc.)
-- - Activity feed RPC
-- - Enhanced collections queue with last_action tracking
-- =============================================================================

BEGIN;

-- =============================================================================
-- PART 1: Collections Actions Log Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.collections_actions_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  invoice_id uuid,
  action_type text NOT NULL CHECK (action_type IN ('contacted', 'promise_to_pay', 'payment_plan', 'dispute', 'resolved', 'note')),
  action_note text,
  promise_date date,
  promise_amount numeric,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS collections_actions_log_company_created_idx
  ON public.collections_actions_log(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS collections_actions_log_company_customer_created_idx
  ON public.collections_actions_log(company_id, customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS collections_actions_log_company_invoice_created_idx
  ON public.collections_actions_log(company_id, invoice_id, created_at DESC)
  WHERE invoice_id IS NOT NULL;

-- Enable RLS
ALTER TABLE public.collections_actions_log ENABLE ROW LEVEL SECURITY;

-- SELECT policy: company-scoped for admin/manager/dispatcher
DROP POLICY IF EXISTS collections_actions_log_select_company ON public.collections_actions_log;
CREATE POLICY collections_actions_log_select_company
ON public.collections_actions_log
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_user_role() IN ('admin', 'manager', 'dispatcher')
);

-- INSERT policy: only via RPC (or restrict to admin/manager/dispatcher)
DROP POLICY IF EXISTS collections_actions_log_insert_company ON public.collections_actions_log;
CREATE POLICY collections_actions_log_insert_company
ON public.collections_actions_log
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.current_company_id()
  AND public.current_user_role() IN ('admin', 'manager', 'dispatcher')
  AND created_by = auth.uid()
);

-- =============================================================================
-- PART 2: RPC - log_collection_action_for_customer
-- =============================================================================

CREATE OR REPLACE FUNCTION public.log_collection_action_for_customer(
  p_customer_id uuid,
  p_action_type text,
  p_action_note text DEFAULT NULL,
  p_invoice_id uuid DEFAULT NULL,
  p_promise_date date DEFAULT NULL,
  p_promise_amount numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_role text;
  v_customer record;
  v_invoice record;
  v_log_id uuid;
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

  -- 3) Only admin/manager/dispatcher can log collection actions
  IF v_role NOT IN ('admin', 'manager', 'dispatcher') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING
      MESSAGE = 'Only admins, managers, and dispatchers can log collection actions';
  END IF;

  -- 4) Validate action_type
  IF p_action_type NOT IN ('contacted', 'promise_to_pay', 'payment_plan', 'dispute', 'resolved', 'note') THEN
    RAISE EXCEPTION 'INVALID_ACTION_TYPE' USING
      MESSAGE = 'Invalid action_type. Must be one of: contacted, promise_to_pay, payment_plan, dispute, resolved, note';
  END IF;

  -- 5) Validate customer belongs to company
  SELECT * INTO v_customer
  FROM public.customers c
  WHERE c.id = p_customer_id
    AND c.company_id = v_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CUSTOMER_NOT_FOUND';
  END IF;

  -- 6) If invoice_id provided, validate invoice belongs to company and customer
  IF p_invoice_id IS NOT NULL THEN
    SELECT * INTO v_invoice
    FROM public.invoices i
    WHERE i.id = p_invoice_id
      AND i.company_id = v_company_id
      AND i.customer_id = p_customer_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVOICE_NOT_FOUND' USING
        MESSAGE = 'Invoice not found or does not belong to this customer';
    END IF;
  END IF;

  -- 7) Insert action log
  INSERT INTO public.collections_actions_log (
    company_id,
    customer_id,
    invoice_id,
    action_type,
    action_note,
    promise_date,
    promise_amount,
    created_by
  ) VALUES (
    v_company_id,
    p_customer_id,
    p_invoice_id,
    p_action_type,
    p_action_note,
    p_promise_date,
    p_promise_amount,
    v_user_id
  )
  RETURNING id INTO v_log_id;

  -- 8) Return log ID
  RETURN v_log_id;
END;
$$;

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION public.log_collection_action_for_customer(uuid, text, text, uuid, date, numeric) TO authenticated;

-- =============================================================================
-- PART 3: RPC - get_collections_activity_for_company
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_collections_activity_for_company(
  p_limit int DEFAULT 25
)
RETURNS TABLE (
  created_at timestamptz,
  customer_id uuid,
  customer_name text,
  invoice_id uuid,
  action_type text,
  action_note text,
  promise_date date,
  promise_amount numeric,
  created_by_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_role text;
  v_limit int;
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

  -- 3) Only admin/manager/dispatcher can view collections activity
  IF v_role NOT IN ('admin', 'manager', 'dispatcher') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING
      MESSAGE = 'Only admins, managers, and dispatchers can view collections activity';
  END IF;

  -- 4) Parameter validation: clamp p_limit to 1-100
  v_limit := COALESCE(p_limit, 25);
  v_limit := GREATEST(1, LEAST(v_limit, 100));

  -- 5) Return activity feed
  RETURN QUERY
  SELECT
    cal.created_at,
    cal.customer_id,
    COALESCE(
      NULLIF(c.full_name, ''),
      NULLIF(c.email, ''),
      'Unknown Customer'
    ) AS customer_name,
    cal.invoice_id,
    cal.action_type,
    cal.action_note,
    cal.promise_date,
    cal.promise_amount,
    COALESCE(
      NULLIF(p.full_name, ''),
      NULLIF(p.email, ''),
      'Unknown User'
    ) AS created_by_name
  FROM public.collections_actions_log cal
  LEFT JOIN public.customers c ON c.id = cal.customer_id AND c.company_id = cal.company_id
  LEFT JOIN public.profiles p ON p.id = cal.created_by
  WHERE cal.company_id = v_company_id
  ORDER BY cal.created_at DESC
  LIMIT v_limit;
END;
$$;

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION public.get_collections_activity_for_company(int) TO authenticated;

-- =============================================================================
-- PART 4: Upgrade get_collections_queue_for_company with last_action fields
-- =============================================================================

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
  last_action_type text
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

  -- 4) Return prioritized collections queue with last_action fields
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
    END AS suggested_action,
    -- Last action fields (new)
    cla.last_action_at,
    cla.last_action_type
  FROM customer_ar ca
  LEFT JOIN public.customers c ON c.id = ca.customer_id AND c.company_id = v_company_id
  LEFT JOIN customer_payments cp ON cp.customer_id = ca.customer_id
  LEFT JOIN customer_payment_history cph ON cph.customer_id = ca.customer_id
  LEFT JOIN customer_last_action cla ON cla.customer_id = ca.customer_id
  ORDER BY priority_score DESC, ca.oldest_due_date ASC NULLS LAST
  LIMIT p_limit;
END;
$$;

-- Grant execute to authenticated (role check enforced inside function)
GRANT EXECUTE ON FUNCTION public.get_collections_queue_for_company(int, timestamptz) TO authenticated;

COMMIT;
