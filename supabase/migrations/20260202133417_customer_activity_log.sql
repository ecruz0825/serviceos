BEGIN;

-- =============================================================================
-- Customer Activity Log: Timeline system for customer interactions
-- - Multi-tenant safe (company_id)
-- - Role-based RLS (admin/crew/customer)
-- - RPC function for automatic logging
-- =============================================================================

-- 1) Create customer_activity_log table
CREATE TABLE IF NOT EXISTS public.customer_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_title text NOT NULL,
  event_description text,
  related_id uuid,
  event_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- 2) Add indexes for performance
CREATE INDEX IF NOT EXISTS customer_activity_log_customer_id_idx 
  ON public.customer_activity_log(customer_id);

CREATE INDEX IF NOT EXISTS customer_activity_log_company_customer_idx 
  ON public.customer_activity_log(company_id, customer_id);

CREATE INDEX IF NOT EXISTS customer_activity_log_event_type_idx 
  ON public.customer_activity_log(event_type);

-- 3) Enable RLS
ALTER TABLE public.customer_activity_log ENABLE ROW LEVEL SECURITY;

-- 4) Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS customer_activity_log_select_admin ON public.customer_activity_log;
DROP POLICY IF EXISTS customer_activity_log_select_crew ON public.customer_activity_log;
DROP POLICY IF EXISTS customer_activity_log_select_customer ON public.customer_activity_log;
DROP POLICY IF EXISTS customer_activity_log_insert_admin ON public.customer_activity_log;

-- 5) RLS Policies

-- SELECT: Admins can select all events in their company
CREATE POLICY customer_activity_log_select_admin
ON public.customer_activity_log
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
);

-- SELECT: Crew can select events for customers assigned to jobs they work on
-- Crew member must be assigned to a job (via team or legacy assigned_to) that belongs to the customer
CREATE POLICY customer_activity_log_select_crew
ON public.customer_activity_log
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'crew'
  AND customer_id IN (
    -- Check if crew member is assigned to any job for this customer
    SELECT DISTINCT j.customer_id
    FROM public.jobs j
    WHERE j.company_id = public.current_company_id()
      AND (
        -- New team-based assignment: crew member is in the assigned team
        j.assigned_team_id IN (
          SELECT tm.team_id
          FROM public.team_members tm
          INNER JOIN public.crew_members cm ON cm.id = tm.crew_member_id
          WHERE cm.user_id = auth.uid()
            AND cm.company_id = public.current_company_id()
        )
        OR
        -- Legacy assignment: crew member is directly assigned
        j.assigned_to IN (
          SELECT cm.id
          FROM public.crew_members cm
          WHERE cm.user_id = auth.uid()
            AND cm.company_id = public.current_company_id()
        )
      )
  )
);

-- SELECT: Customers can select ONLY events tied to themselves
CREATE POLICY customer_activity_log_select_customer
ON public.customer_activity_log
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'customer'
  AND customer_id IN (
    SELECT id
    FROM public.customers
    WHERE user_id = auth.uid()
      AND company_id = public.current_company_id()
  )
);

-- INSERT: Only admins can insert activity logs (via RPC)
CREATE POLICY customer_activity_log_insert_admin
ON public.customer_activity_log
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
);

-- 6) RPC: log_customer_activity
-- Automatically injects company_id and created_by
-- Only admins can call this function
CREATE OR REPLACE FUNCTION public.log_customer_activity(
  p_customer_id uuid,
  p_event_type text,
  p_event_title text,
  p_event_description text DEFAULT NULL,
  p_related_id uuid DEFAULT NULL,
  p_event_data jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_company_id uuid;
  v_role text;
  v_log_id uuid;
BEGIN
  -- Require authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Get company_id and role from current user's profile
  SELECT company_id, role INTO v_company_id, v_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'User must be associated with a company';
  END IF;

  -- Only admins can log activity
  IF v_role != 'admin' THEN
    RAISE EXCEPTION 'Only admins can log customer activity';
  END IF;

  -- Verify customer belongs to same company
  IF NOT EXISTS (
    SELECT 1
    FROM public.customers
    WHERE id = p_customer_id
      AND company_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'Customer not found or access denied';
  END IF;

  -- Insert activity log
  INSERT INTO public.customer_activity_log (
    company_id,
    customer_id,
    event_type,
    event_title,
    event_description,
    related_id,
    event_data,
    created_by
  )
  VALUES (
    v_company_id,
    p_customer_id,
    p_event_type,
    p_event_title,
    p_event_description,
    p_related_id,
    p_event_data,
    auth.uid()
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

COMMIT;

