-- =============================================================================
-- CFO Collections Escalations Queue (Phase C6)
-- =============================================================================
-- Adds an escalations queue that highlights customers needing immediate action
-- based on deterministic rules. All logic computed in Postgres RPCs.
-- =============================================================================

BEGIN;

-- =============================================================================
-- RPC: get_collections_escalations_for_company
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_collections_escalations_for_company(
  p_limit int DEFAULT 25,
  p_as_of timestamptz DEFAULT now()
)
RETURNS TABLE (
  customer_id uuid,
  customer_name text,
  overdue_balance numeric,
  total_balance_due numeric,
  days_past_due_max int,
  promise_breached boolean,
  followup_due boolean,
  next_followup_at timestamptz,
  last_action_at timestamptz,
  last_action_type text,
  escalation_level text,
  reason text,
  recommended_action text,
  priority_score numeric
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

  -- 3) Only admin/manager/dispatcher can view escalations
  IF v_role NOT IN ('admin', 'manager', 'dispatcher') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING
      MESSAGE = 'Only admins, managers, and dispatchers can view collection escalations';
  END IF;

  -- 4) Parameter validation
  v_as_of := COALESCE(p_as_of, now());
  v_limit := COALESCE(p_limit, 25);
  v_limit := GREATEST(1, LEAST(v_limit, 100));

  -- 5) Get base collections queue data (reuses existing hardened RPC)
  RETURN QUERY
  WITH base_queue AS (
    SELECT
      customer_id,
      customer_name,
      overdue_balance,
      total_balance_due,
      days_past_due_max,
      promise_breached,
      followup_due,
      next_followup_at,
      last_action_at,
      last_action_type,
      days_since_last_action,
      priority_score
    FROM public.get_collections_queue_for_company(v_limit * 2, v_as_of) -- Get more rows to filter
  ),
  escalated AS (
    SELECT
      bq.*,
      CASE
        -- CRITICAL: Promise breached with overdue balance
        WHEN bq.promise_breached = true AND COALESCE(bq.overdue_balance, 0) > 0 THEN
          'critical'::text
        -- HIGH: Follow-up due
        WHEN bq.followup_due = true THEN
          'high'::text
        -- HIGH: 30+ days past due with high balance
        WHEN COALESCE(bq.days_past_due_max, 0) >= 30 AND COALESCE(bq.overdue_balance, 0) >= 500 THEN
          'high'::text
        -- MEDIUM: No recent collections activity
        WHEN COALESCE(bq.days_since_last_action, 999) >= 14 AND COALESCE(bq.overdue_balance, 0) > 0 THEN
          'medium'::text
        ELSE NULL::text
      END AS escalation_level,
      CASE
        WHEN bq.promise_breached = true AND COALESCE(bq.overdue_balance, 0) > 0 THEN
          'Promise-to-pay breached'::text
        WHEN bq.followup_due = true THEN
          'Follow-up due'::text
        WHEN COALESCE(bq.days_past_due_max, 0) >= 30 AND COALESCE(bq.overdue_balance, 0) >= 500 THEN
          '30+ days past due with high balance'::text
        WHEN COALESCE(bq.days_since_last_action, 999) >= 14 AND COALESCE(bq.overdue_balance, 0) > 0 THEN
          'No recent collections activity'::text
        ELSE NULL::text
      END AS reason,
      CASE
        WHEN bq.promise_breached = true AND COALESCE(bq.overdue_balance, 0) > 0 THEN
          'Call now + resend invoice + set new promise date'::text
        WHEN bq.followup_due = true THEN
          'Call customer + log outcome'::text
        WHEN COALESCE(bq.days_past_due_max, 0) >= 30 AND COALESCE(bq.overdue_balance, 0) >= 500 THEN
          'Call + send final notice'::text
        WHEN COALESCE(bq.days_since_last_action, 999) >= 14 AND COALESCE(bq.overdue_balance, 0) > 0 THEN
          'Send reminder + schedule follow-up'::text
        ELSE NULL::text
      END AS recommended_action
    FROM base_queue bq
    WHERE (
      -- Only include rows that match escalation criteria
      (bq.promise_breached = true AND COALESCE(bq.overdue_balance, 0) > 0)
      OR (bq.followup_due = true)
      OR (COALESCE(bq.days_past_due_max, 0) >= 30 AND COALESCE(bq.overdue_balance, 0) >= 500)
      OR (COALESCE(bq.days_since_last_action, 999) >= 14 AND COALESCE(bq.overdue_balance, 0) > 0)
    )
  )
  SELECT
    e.customer_id,
    e.customer_name,
    COALESCE(e.overdue_balance, 0)::numeric AS overdue_balance,
    COALESCE(e.total_balance_due, 0)::numeric AS total_balance_due,
    COALESCE(e.days_past_due_max, 0)::int AS days_past_due_max,
    COALESCE(e.promise_breached, false)::boolean AS promise_breached,
    COALESCE(e.followup_due, false)::boolean AS followup_due,
    e.next_followup_at,
    e.last_action_at,
    e.last_action_type,
    e.escalation_level,
    e.reason,
    e.recommended_action,
    COALESCE(e.priority_score, 0)::numeric AS priority_score
  FROM escalated e
  WHERE e.escalation_level IS NOT NULL
  ORDER BY
    CASE e.escalation_level
      WHEN 'critical' THEN 1
      WHEN 'high' THEN 2
      WHEN 'medium' THEN 3
      ELSE 4
    END,
    COALESCE(e.overdue_balance, 0) DESC,
    COALESCE(e.days_past_due_max, 0) DESC,
    COALESCE(e.priority_score, 0) DESC
  LIMIT v_limit;
END;
$$;

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION public.get_collections_escalations_for_company(int, timestamptz) TO authenticated;

COMMIT;
