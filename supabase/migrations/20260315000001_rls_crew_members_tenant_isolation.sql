BEGIN;

-- =============================================================================
-- RLS Remediation Phase 1: Crew Members Tenant Isolation
-- Adds Row Level Security policies to enforce tenant boundaries for crew_members
-- =============================================================================

-- 1) Enable RLS on crew_members table (if not already enabled)
ALTER TABLE public.crew_members ENABLE ROW LEVEL SECURITY;

-- 2) Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS crew_members_select_admin ON public.crew_members;
DROP POLICY IF EXISTS crew_members_select_crew_own ON public.crew_members;
DROP POLICY IF EXISTS crew_members_select_crew_company ON public.crew_members;
DROP POLICY IF EXISTS crew_members_insert_admin ON public.crew_members;
DROP POLICY IF EXISTS crew_members_update_admin ON public.crew_members;
DROP POLICY IF EXISTS crew_members_delete_admin ON public.crew_members;

-- 3) RLS Policies for crew_members table

-- SELECT: Admin can see all crew members in their company
CREATE POLICY crew_members_select_admin
ON public.crew_members
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
);

-- SELECT: Crew can see their own record
CREATE POLICY crew_members_select_crew_own
ON public.crew_members
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND user_id = auth.uid()
  AND public.current_user_role() = 'crew'
);

-- SELECT: Crew can see other crew members in their company (for team visibility)
CREATE POLICY crew_members_select_crew_company
ON public.crew_members
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'crew'
);

-- INSERT: Admin can create crew members in their company
CREATE POLICY crew_members_insert_admin
ON public.crew_members
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
);

-- UPDATE: Admin can update crew members in their company
-- Note: Crew UPDATE is disabled for now per Phase 1 safety requirements
CREATE POLICY crew_members_update_admin
ON public.crew_members
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

-- DELETE: Admin can delete crew members in their company
CREATE POLICY crew_members_delete_admin
ON public.crew_members
FOR DELETE
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
);

COMMIT;
