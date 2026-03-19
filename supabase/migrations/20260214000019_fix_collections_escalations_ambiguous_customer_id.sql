-- Fix: get_collections_escalations_for_company() ambiguous column references (customer_id)
-- Root cause: unqualified identifiers inside PL/pgSQL collide with OUT/return-column names.

BEGIN;

DROP FUNCTION IF EXISTS public.get_collections_escalations_for_company(integer, timestamp with time zone);
DROP FUNCTION IF EXISTS public.get_collections_escalations_for_company(integer);
DROP FUNCTION IF EXISTS public.get_collections_escalations_for_company();

CREATE OR REPLACE FUNCTION public.get_collections_escalations_for_company(
  p_limit integer DEFAULT 25,
  p_as_of timestamp with time zone DEFAULT now()
)
RETURNS TABLE(
  customer_id uuid,
  customer_name text,
  overdue_balance numeric,
  total_balance_due numeric,
  days_past_due_max integer,
  promise_breached boolean,
  followup_due boolean,
  next_followup_at timestamp with time zone,
  last_action_at timestamp with time zone,
  last_action_type text,
  escalation_level text,
  reason text,
  recommended_action text,
  priority_score numeric,
  last_comm_at timestamp with time zone,
  comm_count_30d integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_company_id uuid;
  v_role text;
  v_limit int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT p.company_id, p.role
    INTO v_company_id, v_role
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'NO_COMPANY';
  END IF;

  IF v_role NOT IN ('admin','manager','dispatcher') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 25), 100));

  RETURN QUERY
  WITH base AS (
    SELECT
      b.customer_id,
      b.customer_name,
      COALESCE(b.overdue_balance, 0)::numeric AS overdue_balance,
      COALESCE(b.total_balance_due, 0)::numeric AS total_balance_due,
      COALESCE(b.days_past_due_max, 0)::int AS days_past_due_max,
      COALESCE(b.promise_breached, false)::boolean AS promise_breached,
      COALESCE(b.followup_due, false)::boolean AS followup_due,
      b.next_followup_at,
      b.last_action_at,
      b.last_action_type,
      COALESCE(b.days_since_last_action, 0)::int AS days_since_last_action,
      COALESCE(b.priority_score, 0)::numeric AS priority_score,
      b.last_comm_at,
      COALESCE(b.comm_count_30d, 0)::int AS comm_count_30d
    FROM public.get_collections_queue_for_company(v_limit, p_as_of) b
  ),
  escalations AS (
    SELECT
      b.customer_id,
      b.customer_name,
      b.overdue_balance,
      b.total_balance_due,
      b.days_past_due_max,
      b.promise_breached,
      b.followup_due,
      b.next_followup_at,
      b.last_action_at,
      b.last_action_type,
      b.last_comm_at,
      b.comm_count_30d,
      CASE
        WHEN (b.promise_breached = true AND b.overdue_balance > 0) THEN 'critical'
        WHEN (b.followup_due = true) THEN 'high'
        WHEN (b.days_past_due_max >= 30 AND b.overdue_balance >= 500) THEN 'high'
        WHEN (b.days_since_last_action >= 14 AND b.overdue_balance > 0) THEN 'medium'
        ELSE NULL
      END AS escalation_level,
      CASE
        WHEN (b.promise_breached = true AND b.overdue_balance > 0) THEN 'Promise-to-pay breached'
        WHEN (b.followup_due = true) THEN 'Follow-up due'
        WHEN (b.days_past_due_max >= 30 AND b.overdue_balance >= 500) THEN '30+ days past due with high balance'
        WHEN (b.days_since_last_action >= 14 AND b.overdue_balance > 0) THEN 'No recent collections activity'
        ELSE NULL
      END AS reason,
      CASE
        WHEN (b.promise_breached = true AND b.overdue_balance > 0) THEN 'Call now + resend invoice + set new promise date'
        WHEN (b.followup_due = true) THEN 'Call customer + log outcome'
        WHEN (b.days_past_due_max >= 30 AND b.overdue_balance >= 500) THEN 'Call + send final notice'
        WHEN (b.days_since_last_action >= 14 AND b.overdue_balance > 0) THEN 'Send reminder + schedule follow-up'
        ELSE NULL
      END AS recommended_action,
      b.priority_score
    FROM base b
    WHERE
      (b.promise_breached = true AND b.overdue_balance > 0)
      OR (b.followup_due = true)
      OR (b.days_past_due_max >= 30 AND b.overdue_balance >= 500)
      OR (b.days_since_last_action >= 14 AND b.overdue_balance > 0)
  )
  SELECT
    e.customer_id,
    e.customer_name,
    e.overdue_balance,
    e.total_balance_due,
    e.days_past_due_max,
    e.promise_breached,
    e.followup_due,
    e.next_followup_at,
    e.last_action_at,
    e.last_action_type,
    e.escalation_level,
    e.reason,
    e.recommended_action,
    e.priority_score,
    e.last_comm_at,
    e.comm_count_30d
  FROM escalations e
  WHERE e.escalation_level IS NOT NULL
  ORDER BY
    CASE e.escalation_level
      WHEN 'critical' THEN 1
      WHEN 'high' THEN 2
      WHEN 'medium' THEN 3
      ELSE 99
    END,
    e.overdue_balance DESC,
    e.days_past_due_max DESC,
    e.priority_score DESC
  LIMIT v_limit;

END;
$$;

GRANT EXECUTE ON FUNCTION public.get_collections_escalations_for_company(integer, timestamp with time zone) TO authenticated;

COMMIT;
