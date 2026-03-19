BEGIN;

-- =============================================================================
-- RLS Remediation Phase 3: Jobs Tenant Isolation (Final Launch Blocker)
-- Adds Row Level Security policies to enforce tenant boundaries for jobs
-- Supports admin, crew, and customer roles with relationship-based access
-- =============================================================================

-- 1) Enable RLS on jobs table (if not already enabled)
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- 2) Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS jobs_select_admin ON public.jobs;
DROP POLICY IF EXISTS jobs_select_crew_assigned ON public.jobs;
DROP POLICY IF EXISTS jobs_select_customer_own ON public.jobs;
DROP POLICY IF EXISTS jobs_insert_admin ON public.jobs;
DROP POLICY IF EXISTS jobs_update_admin ON public.jobs;
DROP POLICY IF EXISTS jobs_update_crew_assigned ON public.jobs;
DROP POLICY IF EXISTS jobs_delete_admin ON public.jobs;

-- 3) RLS Policies for jobs table

-- SELECT: Admin can see all jobs in their company
CREATE POLICY jobs_select_admin
ON public.jobs
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
);

-- SELECT: Crew can see jobs assigned to their team
CREATE POLICY jobs_select_crew_assigned
ON public.jobs
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'crew'
  AND EXISTS (
    SELECT 1
    FROM public.teams t
    JOIN public.team_members tm ON tm.team_id = t.id
    JOIN public.crew_members cm ON cm.id = tm.crew_member_id
    WHERE t.id = jobs.assigned_team_id
      AND t.company_id = jobs.company_id
      AND cm.user_id = auth.uid()
  )
);

-- SELECT: Customer can see their own jobs
CREATE POLICY jobs_select_customer_own
ON public.jobs
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'customer'
  AND EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = jobs.customer_id
      AND c.company_id = jobs.company_id
      AND c.user_id = auth.uid()
  )
);

-- INSERT: Admin can create jobs in their company
-- Also verify that customer belongs to the same company
CREATE POLICY jobs_insert_admin
ON public.jobs
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
  AND EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = jobs.customer_id
      AND c.company_id = public.current_company_id()
  )
);

-- UPDATE: Admin can update jobs in their company
CREATE POLICY jobs_update_admin
ON public.jobs
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

-- UPDATE: Crew can update jobs assigned to their team
-- Note: Crew can update fields like status, before_image, after_image, notes, etc.
-- RLS ensures they can only update jobs assigned to teams they're members of
CREATE POLICY jobs_update_crew_assigned
ON public.jobs
FOR UPDATE
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'crew'
  AND EXISTS (
    SELECT 1
    FROM public.teams t
    JOIN public.team_members tm ON tm.team_id = t.id
    JOIN public.crew_members cm ON cm.id = tm.crew_member_id
    WHERE t.id = jobs.assigned_team_id
      AND t.company_id = jobs.company_id
      AND cm.user_id = auth.uid()
  )
)
WITH CHECK (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'crew'
  AND EXISTS (
    SELECT 1
    FROM public.teams t
    JOIN public.team_members tm ON tm.team_id = t.id
    JOIN public.crew_members cm ON cm.id = tm.crew_member_id
    WHERE t.id = jobs.assigned_team_id
      AND t.company_id = jobs.company_id
      AND cm.user_id = auth.uid()
  )
);

-- DELETE: Admin can delete jobs in their company
CREATE POLICY jobs_delete_admin
ON public.jobs
FOR DELETE
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
);

COMMIT;
