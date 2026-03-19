-- =============================================================================
-- CFO Collections Cases (Phase C8)
-- =============================================================================
-- Introduces a first-class "collections case" object with owner, status, due date,
-- and next action. Strict multi-tenant isolation.
-- =============================================================================

BEGIN;

-- =============================================================================
-- PART 1: Create collections_cases table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.collections_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.current_company_id(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  due_at timestamptz,
  next_action text,
  notes text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

-- Unique constraint: only one active case per customer per company
CREATE UNIQUE INDEX IF NOT EXISTS collections_cases_company_customer_active_unique
  ON public.collections_cases(company_id, customer_id)
  WHERE status IN ('open', 'in_progress');

-- Indexes for performance
CREATE INDEX IF NOT EXISTS collections_cases_company_status_priority_idx
  ON public.collections_cases(company_id, status, priority);

CREATE INDEX IF NOT EXISTS collections_cases_company_assigned_status_idx
  ON public.collections_cases(company_id, assigned_to, status)
  WHERE assigned_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS collections_cases_company_due_at_idx
  ON public.collections_cases(company_id, due_at)
  WHERE due_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS collections_cases_company_updated_at_idx
  ON public.collections_cases(company_id, updated_at DESC);

-- =============================================================================
-- PART 2: updated_at trigger
-- =============================================================================

-- Create or replace the set_updated_at function if it doesn't exist
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Create trigger on collections_cases
DROP TRIGGER IF EXISTS trg_collections_cases_updated_at ON public.collections_cases;
CREATE TRIGGER trg_collections_cases_updated_at
  BEFORE UPDATE ON public.collections_cases
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- PART 3: Row Level Security (RLS)
-- =============================================================================

ALTER TABLE public.collections_cases ENABLE ROW LEVEL SECURITY;

-- SELECT policy: company-scoped for admin/manager/dispatcher
DROP POLICY IF EXISTS collections_cases_select_company ON public.collections_cases;
CREATE POLICY collections_cases_select_company
ON public.collections_cases
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_user_role() IN ('admin', 'manager', 'dispatcher')
);

-- INSERT policy: company-scoped for admin/manager/dispatcher
DROP POLICY IF EXISTS collections_cases_insert_company ON public.collections_cases;
CREATE POLICY collections_cases_insert_company
ON public.collections_cases
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.current_company_id()
  AND public.current_user_role() IN ('admin', 'manager', 'dispatcher')
);

-- UPDATE policy: company-scoped for admin/manager/dispatcher
DROP POLICY IF EXISTS collections_cases_update_company ON public.collections_cases;
CREATE POLICY collections_cases_update_company
ON public.collections_cases
FOR UPDATE
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_user_role() IN ('admin', 'manager', 'dispatcher')
)
WITH CHECK (
  company_id = public.current_company_id()
  AND public.current_user_role() IN ('admin', 'manager', 'dispatcher')
);

-- DELETE policy: company-scoped for admin/manager/dispatcher
DROP POLICY IF EXISTS collections_cases_delete_company ON public.collections_cases;
CREATE POLICY collections_cases_delete_company
ON public.collections_cases
FOR DELETE
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_user_role() IN ('admin', 'manager', 'dispatcher')
);

COMMIT;
