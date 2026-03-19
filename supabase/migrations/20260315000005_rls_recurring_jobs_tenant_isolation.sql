BEGIN;

-- =============================================================================
-- RLS Remediation Phase 3: Recurring Jobs Tenant Isolation
-- Adds Row Level Security policies to enforce tenant boundaries for recurring_jobs
-- =============================================================================

-- 1) Enable RLS on recurring_jobs table (if not already enabled)
ALTER TABLE public.recurring_jobs ENABLE ROW LEVEL SECURITY;

-- 2) Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS recurring_jobs_select_admin ON public.recurring_jobs;
DROP POLICY IF EXISTS recurring_jobs_insert_admin ON public.recurring_jobs;
DROP POLICY IF EXISTS recurring_jobs_update_admin ON public.recurring_jobs;
DROP POLICY IF EXISTS recurring_jobs_delete_admin ON public.recurring_jobs;

-- 3) RLS Policies for recurring_jobs table

-- SELECT: Admin can see all recurring jobs in their company
CREATE POLICY recurring_jobs_select_admin
ON public.recurring_jobs
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
);

-- INSERT: Admin can create recurring jobs in their company
-- Also verify that customer belongs to the same company
CREATE POLICY recurring_jobs_insert_admin
ON public.recurring_jobs
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
  AND EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = recurring_jobs.customer_id
      AND c.company_id = public.current_company_id()
  )
);

-- UPDATE: Admin can update recurring jobs in their company
CREATE POLICY recurring_jobs_update_admin
ON public.recurring_jobs
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

-- DELETE: Admin can delete recurring jobs in their company
CREATE POLICY recurring_jobs_delete_admin
ON public.recurring_jobs
FOR DELETE
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
);

COMMIT;
