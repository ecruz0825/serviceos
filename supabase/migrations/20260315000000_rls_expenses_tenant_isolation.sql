BEGIN;

-- =============================================================================
-- RLS Remediation Phase 1: Expenses Tenant Isolation
-- Adds Row Level Security policies to enforce tenant boundaries for expenses
-- =============================================================================

-- 1) Enable RLS on expenses table (if not already enabled)
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- 2) Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS expenses_select_admin ON public.expenses;
DROP POLICY IF EXISTS expenses_insert_admin ON public.expenses;
DROP POLICY IF EXISTS expenses_update_admin ON public.expenses;
DROP POLICY IF EXISTS expenses_delete_admin ON public.expenses;

-- 3) RLS Policies for expenses table

-- SELECT: Admin can see all company expenses
CREATE POLICY expenses_select_admin
ON public.expenses
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
);

-- INSERT: Admin can create expenses in their company
CREATE POLICY expenses_insert_admin
ON public.expenses
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
);

-- UPDATE: Admin can update expenses in their company
CREATE POLICY expenses_update_admin
ON public.expenses
FOR UPDATE
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
)
WITH CHECK (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
);

-- DELETE: Admin can delete expenses in their company
CREATE POLICY expenses_delete_admin
ON public.expenses
FOR DELETE
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
);

COMMIT;
