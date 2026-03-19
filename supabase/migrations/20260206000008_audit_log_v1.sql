BEGIN;

-- =============================================================================
-- Audit Log v1: Immutable logging for critical lifecycle actions
-- Tracks who did what, when, and to which record across all entity types
-- =============================================================================

-- 1) Create audit_log table
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_user_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role text NULL,
  entity_type text NOT NULL,        -- 'quote','job','invoice','payment'
  entity_id uuid NOT NULL,
  action text NOT NULL,             -- e.g. 'quote_sent','quote_converted','job_scheduled','invoice_voided','payment_recorded'
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_audit_log_company_created 
  ON public.audit_log(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_company_entity 
  ON public.audit_log(company_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_company_action 
  ON public.audit_log(company_id, action, created_at DESC);

-- 3) Enable RLS
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- 4) Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS audit_log_select_tenant ON public.audit_log;
DROP POLICY IF EXISTS audit_log_insert_tenant ON public.audit_log;

-- 5) RLS Policy: SELECT - authenticated users can see audit logs in their company
CREATE POLICY audit_log_select_tenant
ON public.audit_log
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
);

-- 6) RLS Policy: INSERT - authenticated users can insert audit logs in their company
-- (Restrict to admin/manager/dispatcher for security)
CREATE POLICY audit_log_insert_tenant
ON public.audit_log
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() IN ('admin', 'manager', 'dispatcher')
);

-- 7) Helper function: insert_audit_log
CREATE OR REPLACE FUNCTION public.insert_audit_log(
  p_company_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_action text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid;
  v_role text;
  v_audit_log_id uuid;
BEGIN
  -- Get actor info from current user
  v_user_id := auth.uid();
  
  IF v_user_id IS NOT NULL THEN
    SELECT role INTO v_role
    FROM public.profiles
    WHERE id = v_user_id;
  END IF;

  -- Insert audit log entry
  INSERT INTO public.audit_log (
    company_id,
    actor_user_id,
    actor_role,
    entity_type,
    entity_id,
    action,
    metadata
  ) VALUES (
    p_company_id,
    v_user_id,
    v_role,
    p_entity_type,
    p_entity_id,
    p_action,
    p_metadata
  )
  RETURNING id INTO v_audit_log_id;

  RETURN v_audit_log_id;
END;
$$;

-- 8) Grant execute on helper function to authenticated
GRANT EXECUTE ON FUNCTION public.insert_audit_log(uuid, text, uuid, text, jsonb) TO authenticated;

COMMIT;
