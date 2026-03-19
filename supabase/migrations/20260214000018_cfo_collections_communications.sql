-- =============================================================================
-- CFO Collections Communications Engine (Phase C7)
-- =============================================================================
-- Adds communication templates, logging, and activity tracking to Collections.
-- Enables "one-click execution" for outreach with mailto links + audit trail.
-- =============================================================================

BEGIN;

-- =============================================================================
-- PART A1: Collections Communications Log Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.collections_comms_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'sms', 'call', 'other')),
  template_key text,
  subject text,
  body text,
  to_address text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS collections_comms_log_company_created_idx
  ON public.collections_comms_log(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS collections_comms_log_company_customer_created_idx
  ON public.collections_comms_log(company_id, customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS collections_comms_log_company_invoice_created_idx
  ON public.collections_comms_log(company_id, invoice_id, created_at DESC)
  WHERE invoice_id IS NOT NULL;

-- Enable RLS
ALTER TABLE public.collections_comms_log ENABLE ROW LEVEL SECURITY;

-- SELECT policy: company-scoped for admin/manager/dispatcher
DROP POLICY IF EXISTS collections_comms_log_select_company ON public.collections_comms_log;
CREATE POLICY collections_comms_log_select_company
ON public.collections_comms_log
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_user_role() IN ('admin', 'manager', 'dispatcher')
);

-- INSERT policy: company-scoped for admin/manager/dispatcher
DROP POLICY IF EXISTS collections_comms_log_insert_company ON public.collections_comms_log;
CREATE POLICY collections_comms_log_insert_company
ON public.collections_comms_log
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.current_company_id()
  AND public.current_user_role() IN ('admin', 'manager', 'dispatcher')
  AND created_by = auth.uid()
);

-- =============================================================================
-- PART A2: Collections Communication Templates Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.collections_comm_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid, -- null = global defaults
  template_key text NOT NULL,
  name text NOT NULL,
  subject_template text NOT NULL,
  body_template text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, template_key)
);

-- Index for template lookups
CREATE INDEX IF NOT EXISTS collections_comm_templates_company_key_idx
  ON public.collections_comm_templates(company_id, template_key, is_active);

-- Seed global default templates (company_id = null)
INSERT INTO public.collections_comm_templates (company_id, template_key, name, subject_template, body_template, is_active)
VALUES
  (NULL, 'friendly_reminder', 'Friendly Reminder', 'Payment Reminder - {{company_name}}', 
   'Hi {{customer_name}},\n\nThis is a friendly reminder that you have an outstanding balance of {{balance_due}}.\n\nPlease remit payment at your earliest convenience. If you have any questions, please contact us at {{support_email}} or {{support_phone}}.\n\nThank you,\n{{company_name}}', 
   true),
  (NULL, 'past_due_notice', 'Past Due Notice', 'Past Due Invoice - {{company_name}}', 
   'Dear {{customer_name}},\n\nYour account has a past due balance of {{overdue_balance}}. This invoice is {{days_past_due_max}} days past due.\n\nPlease remit payment immediately to avoid further action. If you have already sent payment, please disregard this notice.\n\nFor questions, contact {{support_email}} or {{support_phone}}.\n\nThank you,\n{{company_name}}', 
   true),
  (NULL, 'final_notice', 'Final Notice', 'Final Notice - Immediate Payment Required - {{company_name}}', 
   'Dear {{customer_name}},\n\nThis is a FINAL NOTICE regarding your overdue account. Your balance of {{overdue_balance}} is {{days_past_due_max}} days past due.\n\nImmediate payment is required. Failure to remit payment may result in account suspension or collection proceedings.\n\nContact us immediately at {{support_email}} or {{support_phone}} to resolve this matter.\n\n{{company_name}}', 
   true),
  (NULL, 'promise_confirm', 'Promise to Pay Confirmation', 'Payment Promise Confirmation - {{company_name}}', 
   'Hi {{customer_name}},\n\nThis confirms your promise to pay {{balance_due}} by {{promise_date}}.\n\nWe appreciate your commitment to resolving this matter. If your circumstances change, please contact us at {{support_email}} or {{support_phone}}.\n\nThank you,\n{{company_name}}', 
   true),
  (NULL, 'thanks_payment', 'Thank You for Payment', 'Thank You for Your Payment - {{company_name}}', 
   'Hi {{customer_name}},\n\nThank you for your recent payment. We appreciate your prompt attention to your account.\n\nIf you have any questions or need assistance, please contact us at {{support_email}} or {{support_phone}}.\n\nBest regards,\n{{company_name}}', 
   true)
ON CONFLICT (company_id, template_key) DO NOTHING;

-- Enable RLS
ALTER TABLE public.collections_comm_templates ENABLE ROW LEVEL SECURITY;

-- SELECT policy: company-scoped OR global templates
DROP POLICY IF EXISTS collections_comm_templates_select ON public.collections_comm_templates;
CREATE POLICY collections_comm_templates_select
ON public.collections_comm_templates
FOR SELECT
TO authenticated
USING (
  (company_id = public.current_company_id() OR company_id IS NULL)
  AND public.current_user_role() IN ('admin', 'manager', 'dispatcher')
);

-- =============================================================================
-- PART A3: RPC - get_collections_comm_templates_for_company
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_collections_comm_templates_for_company()
RETURNS TABLE (
  template_key text,
  name text,
  subject_template text,
  body_template text
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

  -- 3) Only admin/manager/dispatcher can view templates
  IF v_role NOT IN ('admin', 'manager', 'dispatcher') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING
      MESSAGE = 'Only admins, managers, and dispatchers can view communication templates';
  END IF;

  -- 4) Return templates (prefer company-specific, fall back to global)
  RETURN QUERY
  SELECT DISTINCT ON (t.template_key)
    t.template_key,
    t.name,
    t.subject_template,
    t.body_template
  FROM public.collections_comm_templates t
  WHERE (t.company_id = v_company_id OR t.company_id IS NULL)
    AND t.is_active = true
  ORDER BY t.template_key, CASE WHEN t.company_id = v_company_id THEN 0 ELSE 1 END, t.name;
END;
$$;

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION public.get_collections_comm_templates_for_company() TO authenticated;

-- =============================================================================
-- PART A4: RPC - get_customer_contact_for_company
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_customer_contact_for_company(
  p_customer_id uuid
)
RETURNS TABLE (
  customer_id uuid,
  customer_name text,
  customer_email text
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

  -- 3) Only admin/manager/dispatcher can view customer contact
  IF v_role NOT IN ('admin', 'manager', 'dispatcher') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING
      MESSAGE = 'Only admins, managers, and dispatchers can view customer contact information';
  END IF;

  -- 4) Return customer contact info
  RETURN QUERY
  SELECT
    c.id AS customer_id,
    COALESCE(
      NULLIF(c.full_name, ''),
      NULLIF(c.email, ''),
      'Unknown Customer'
    ) AS customer_name,
    NULLIF(c.email, '') AS customer_email
  FROM public.customers c
  WHERE c.id = p_customer_id
    AND c.company_id = v_company_id;
END;
$$;

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION public.get_customer_contact_for_company(uuid) TO authenticated;

-- =============================================================================
-- PART A5: RPC - log_collection_communication
-- =============================================================================

CREATE OR REPLACE FUNCTION public.log_collection_communication(
  p_customer_id uuid,
  p_channel text,
  p_invoice_id uuid DEFAULT NULL,
  p_template_key text DEFAULT NULL,
  p_to_address text DEFAULT NULL,
  p_subject text DEFAULT NULL,
  p_body text DEFAULT NULL
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

  -- 3) Only admin/manager/dispatcher can log communications
  IF v_role NOT IN ('admin', 'manager', 'dispatcher') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING
      MESSAGE = 'Only admins, managers, and dispatchers can log communications';
  END IF;

  -- 4) Validate channel
  IF p_channel NOT IN ('email', 'sms', 'call', 'other') THEN
    RAISE EXCEPTION 'INVALID_CHANNEL' USING
      MESSAGE = 'Channel must be one of: email, sms, call, other';
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

  -- 7) Insert communication log
  INSERT INTO public.collections_comms_log (
    company_id,
    customer_id,
    invoice_id,
    channel,
    template_key,
    subject,
    body,
    to_address,
    created_by
  ) VALUES (
    v_company_id,
    p_customer_id,
    p_invoice_id,
    p_channel,
    p_template_key,
    p_subject,
    p_body,
    p_to_address,
    v_user_id
  )
  RETURNING id INTO v_log_id;

  -- 8) Return log ID
  RETURN v_log_id;
END;
$$;

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION public.log_collection_communication(uuid, text, uuid, text, text, text, text) TO authenticated;

-- =============================================================================
-- PART A6: RPC - get_collections_comms_activity_for_company
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_collections_comms_activity_for_company(
  p_limit int DEFAULT 25
)
RETURNS TABLE (
  created_at timestamptz,
  customer_id uuid,
  customer_name text,
  channel text,
  template_key text,
  to_address text,
  subject text,
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

  -- 3) Only admin/manager/dispatcher can view comms activity
  IF v_role NOT IN ('admin', 'manager', 'dispatcher') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING
      MESSAGE = 'Only admins, managers, and dispatchers can view communications activity';
  END IF;

  -- 4) Parameter validation: clamp p_limit to 1-100
  v_limit := COALESCE(p_limit, 25);
  v_limit := GREATEST(1, LEAST(v_limit, 100));

  -- 5) Return comms activity feed
  RETURN QUERY
  SELECT
    ccl.created_at,
    ccl.customer_id,
    COALESCE(
      NULLIF(c.full_name, ''),
      NULLIF(c.email, ''),
      'Unknown Customer'
    ) AS customer_name,
    ccl.channel,
    ccl.template_key,
    ccl.to_address,
    ccl.subject,
    COALESCE(
      NULLIF(p.full_name, ''),
      NULLIF(p.email, ''),
      'Unknown User'
    ) AS created_by_name
  FROM public.collections_comms_log ccl
  LEFT JOIN public.customers c ON c.id = ccl.customer_id AND c.company_id = ccl.company_id
  LEFT JOIN public.profiles p ON p.id = ccl.created_by
  WHERE ccl.company_id = v_company_id
  ORDER BY ccl.created_at DESC
  LIMIT v_limit;
END;
$$;

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION public.get_collections_comms_activity_for_company(int) TO authenticated;

-- =============================================================================
-- PART A7: Enhance get_collections_queue_for_company with comm fields
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
  last_action_type text,
  promise_breached boolean,
  days_since_last_action int,
  next_followup_at timestamptz,
  followup_due boolean,
  last_comm_at timestamptz,
  comm_count_30d int
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

  -- 4) Return prioritized collections queue with comm fields
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
  ),
  customer_next_followup AS (
    SELECT DISTINCT ON (cf.customer_id)
      cf.customer_id,
      cf.next_followup_at
    FROM public.collections_followups cf
    WHERE cf.company_id = v_company_id
      AND cf.status = 'scheduled'
    ORDER BY cf.customer_id, cf.next_followup_at ASC
  ),
  customer_last_comm AS (
    SELECT
      ccl.customer_id,
      MAX(ccl.created_at) AS last_comm_at,
      COUNT(*) FILTER (WHERE ccl.created_at >= (p_as_of - interval '30 days'))::int AS comm_count_30d
    FROM public.collections_comms_log ccl
    WHERE ccl.company_id = v_company_id
    GROUP BY ccl.customer_id
  )
  SELECT
    ca.customer_id,
    COALESCE(
      NULLIF(c.full_name, ''),
      NULLIF(c.email, ''),
      'Unknown Customer'
    ) AS customer_name,
    ca.open_invoice_count,
    COALESCE(ca.total_balance_due, 0)::numeric AS total_balance_due,
    ca.oldest_due_date,
    COALESCE(ca.days_past_due_max, 0)::int AS days_past_due_max,
    COALESCE(ca.overdue_balance, 0)::numeric AS overdue_balance,
    cp.last_payment_at,
    COALESCE(cph.avg_days_to_pay, 0)::numeric AS avg_days_to_pay,
    -- Recalculated priority score with smart bonuses + comm scoring
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
      -- Comm scoring bumps (A9)
      + (CASE 
          WHEN (clc.last_comm_at IS NULL OR clc.last_comm_at <= p_as_of - interval '14 days')
            AND COALESCE(ca.overdue_balance, 0) > 0
          THEN 8::numeric
          ELSE 0::numeric
        END)
      + (CASE 
          WHEN COALESCE(clc.comm_count_30d, 0) = 0
            AND COALESCE(ca.overdue_balance, 0) > 0
          THEN 4::numeric
          ELSE 0::numeric
        END)
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
    -- Smart scoring fields
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
    END AS days_since_last_action,
    -- Follow-up fields
    cnf.next_followup_at AS next_followup_at,
    (cnf.next_followup_at IS NOT NULL AND cnf.next_followup_at <= p_as_of)::boolean AS followup_due,
    -- Comm fields (appended at end - A7)
    clc.last_comm_at,
    COALESCE(clc.comm_count_30d, 0)::int AS comm_count_30d
  FROM customer_ar ca
  LEFT JOIN public.customers c ON c.id = ca.customer_id AND c.company_id = v_company_id
  LEFT JOIN customer_payments cp ON cp.customer_id = ca.customer_id
  LEFT JOIN customer_payment_history cph ON cph.customer_id = ca.customer_id
  LEFT JOIN customer_last_action cla ON cla.customer_id = ca.customer_id
  LEFT JOIN customer_last_promise clp ON clp.customer_id = ca.customer_id
  LEFT JOIN customer_next_followup cnf ON cnf.customer_id = ca.customer_id
  LEFT JOIN customer_last_comm clc ON clc.customer_id = ca.customer_id
  ORDER BY priority_score DESC, ca.oldest_due_date ASC NULLS LAST
  LIMIT p_limit;
END;
$$;

-- Grant execute to authenticated (role check enforced inside function)
GRANT EXECUTE ON FUNCTION public.get_collections_queue_for_company(int, timestamptz) TO authenticated;

-- =============================================================================
-- PART A8: Enhance get_collections_escalations_for_company with comm fields
-- =============================================================================

DROP FUNCTION IF EXISTS public.get_collections_escalations_for_company(integer, timestamptz);

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
  priority_score numeric,
  last_comm_at timestamptz,
  comm_count_30d int
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

  -- 5) Get base collections queue data (reuses existing hardened RPC with comm fields)
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
      priority_score,
      last_comm_at,
      comm_count_30d
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
    COALESCE(e.priority_score, 0)::numeric AS priority_score,
    -- Comm fields (appended at end - A8)
    e.last_comm_at,
    COALESCE(e.comm_count_30d, 0)::int AS comm_count_30d
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
