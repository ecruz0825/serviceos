BEGIN;

-- =============================================================================
-- Fix Crew Portal Payment Visibility Under Team-Based Assignments
-- =============================================================================
-- Problem: Crew users cannot see payments for jobs assigned to their team
-- (only jobs directly assigned via assigned_to).
--
-- Solution: Update payments_select_crew_assigned RLS policy to support both:
-- 1) Legacy: jobs.assigned_to = crew_member_id
-- 2) Team-based: jobs.assigned_team_id + team_members lookup
-- =============================================================================

-- Ensure RLS is enabled (safe/idempotent)
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Replace the crew select policy with a team-aware version
DROP POLICY IF EXISTS payments_select_crew_assigned ON public.payments;

CREATE POLICY payments_select_crew_assigned
ON public.payments
FOR SELECT
TO authenticated
USING (
  company_id = public.current_company_id()
  AND public.current_user_role() = 'crew'::text
  AND EXISTS (
    SELECT 1
    FROM public.jobs j
    WHERE j.id = payments.job_id
      AND j.company_id = payments.company_id
      AND (
        -- Legacy: directly assigned to the crew member
        j.assigned_to = public.current_crew_member_id()

        -- Team-based: job assigned to a team the crew member belongs to
        OR (
          j.assigned_team_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.team_members tm
            WHERE tm.team_id = j.assigned_team_id
              AND tm.crew_member_id = public.current_crew_member_id()
          )
        )
      )
  )
);

-- Verify policy exists (commented out - uncomment to verify after migration)
-- SELECT schemaname, tablename, policyname, cmd
-- FROM pg_policies
-- WHERE schemaname='public' AND tablename='payments' AND policyname='payments_select_crew_assigned';

COMMIT;
