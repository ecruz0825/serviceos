BEGIN;

-- =============================================================================
-- AB10 Phase 1: Teams Infrastructure
-- - Create teams and team_members tables
-- - Add company-scoped RLS policies
-- - Non-breaking: No changes to jobs table yet
-- =============================================================================

-- 1) Create teams table
CREATE TABLE IF NOT EXISTS public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT teams_company_name_unique UNIQUE(company_id, name)
);

-- 2) Create team_members table
CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  crew_member_id uuid NOT NULL REFERENCES public.crew_members(id) ON DELETE CASCADE,
  role text DEFAULT 'member', -- 'member' or 'lead'
  created_at timestamptz DEFAULT now(),
  CONSTRAINT team_members_team_crew_unique UNIQUE(team_id, crew_member_id)
);

-- 3) Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_teams_company_id ON public.teams(company_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON public.team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_crew_member_id ON public.team_members(crew_member_id);

-- 4) Enable RLS on both tables
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- 5) Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS teams_select_same_company ON public.teams;
DROP POLICY IF EXISTS teams_insert_admin ON public.teams;
DROP POLICY IF EXISTS teams_update_admin ON public.teams;
DROP POLICY IF EXISTS teams_delete_admin ON public.teams;

DROP POLICY IF EXISTS team_members_select_same_company ON public.team_members;
DROP POLICY IF EXISTS team_members_insert_admin ON public.team_members;
DROP POLICY IF EXISTS team_members_update_admin ON public.team_members;
DROP POLICY IF EXISTS team_members_delete_admin ON public.team_members;

-- 6) RLS Policies for teams table

-- SELECT: Users can see teams in their company
CREATE POLICY teams_select_same_company
ON public.teams
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
);

-- INSERT: Only admins can create teams
CREATE POLICY teams_insert_admin
ON public.teams
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
);

-- UPDATE: Only admins can update teams
CREATE POLICY teams_update_admin
ON public.teams
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

-- DELETE: Only admins can delete teams
CREATE POLICY teams_delete_admin
ON public.teams
FOR DELETE
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_company_id() IS NOT NULL
  AND public.current_user_role() = 'admin'
);

-- 7) RLS Policies for team_members table

-- SELECT: Users can see team members for teams in their company
CREATE POLICY team_members_select_same_company
ON public.team_members
FOR SELECT
TO authenticated
USING (
  team_id IN (
    SELECT id FROM public.teams
    WHERE company_id = public.current_company_id()
      AND public.current_company_id() IS NOT NULL
  )
);

-- INSERT: Only admins can add team members
CREATE POLICY team_members_insert_admin
ON public.team_members
FOR INSERT
TO authenticated
WITH CHECK (
  team_id IN (
    SELECT id FROM public.teams
    WHERE company_id = public.current_company_id()
      AND public.current_company_id() IS NOT NULL
  )
  AND public.current_user_role() = 'admin'
);

-- UPDATE: Only admins can update team members
CREATE POLICY team_members_update_admin
ON public.team_members
FOR UPDATE
TO authenticated
USING (
  team_id IN (
    SELECT id FROM public.teams
    WHERE company_id = public.current_company_id()
      AND public.current_company_id() IS NOT NULL
  )
  AND public.current_user_role() = 'admin'
)
WITH CHECK (
  team_id IN (
    SELECT id FROM public.teams
    WHERE company_id = public.current_company_id()
      AND public.current_company_id() IS NOT NULL
  )
  AND public.current_user_role() = 'admin'
);

-- DELETE: Only admins can remove team members
CREATE POLICY team_members_delete_admin
ON public.team_members
FOR DELETE
TO authenticated
USING (
  team_id IN (
    SELECT id FROM public.teams
    WHERE company_id = public.current_company_id()
      AND public.current_company_id() IS NOT NULL
  )
  AND public.current_user_role() = 'admin'
);

COMMIT;

