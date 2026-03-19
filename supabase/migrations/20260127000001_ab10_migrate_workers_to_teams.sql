BEGIN;

-- =============================================================================
-- AB10 Phase 2: Migrate Workers to Teams (Backward Compatible)
-- - Create team-of-one records for every existing crew_member
-- - Add jobs.assigned_team_id column (nullable)
-- - Backfill jobs.assigned_team_id based on existing jobs.assigned_to
-- - Non-breaking: jobs.assigned_to remains unchanged
-- =============================================================================

-- Step A: Add assigned_team_id column to jobs table
ALTER TABLE public.jobs 
  ADD COLUMN IF NOT EXISTS assigned_team_id uuid;

-- Step B: Add foreign key constraint (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'jobs_assigned_team_id_fkey' 
    AND conrelid = 'public.jobs'::regclass
  ) THEN
    ALTER TABLE public.jobs
      ADD CONSTRAINT jobs_assigned_team_id_fkey
      FOREIGN KEY (assigned_team_id)
      REFERENCES public.teams(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Step C: Create team-of-one rows for each crew_member
-- Deterministic mapping: company_id + full_name
INSERT INTO public.teams (company_id, name)
SELECT DISTINCT
  cm.company_id,
  cm.full_name
FROM public.crew_members cm
WHERE cm.company_id IS NOT NULL
  AND cm.full_name IS NOT NULL
  AND cm.full_name != ''
ON CONFLICT (company_id, name) DO NOTHING;

-- Step D: Create team_members rows linking crew_members to their teams
-- Role: 'lead' if crew_members.role='lead', else 'member'
INSERT INTO public.team_members (team_id, crew_member_id, role)
SELECT 
  t.id AS team_id,
  cm.id AS crew_member_id,
  CASE 
    WHEN cm.role = 'lead' THEN 'lead'
    ELSE 'member'
  END AS role
FROM public.crew_members cm
INNER JOIN public.teams t
  ON t.company_id = cm.company_id
  AND t.name = cm.full_name
WHERE cm.company_id IS NOT NULL
  AND cm.full_name IS NOT NULL
  AND cm.full_name != ''
ON CONFLICT (team_id, crew_member_id) DO NOTHING;

-- Step E: Backfill jobs.assigned_team_id
-- Only update rows where assigned_team_id is NULL and assigned_to is NOT NULL
UPDATE public.jobs j
SET assigned_team_id = t.id
FROM public.crew_members cm
INNER JOIN public.teams t
  ON t.company_id = cm.company_id
  AND t.name = cm.full_name
WHERE j.assigned_to = cm.id
  AND j.assigned_team_id IS NULL
  AND j.assigned_to IS NOT NULL
  AND cm.company_id IS NOT NULL
  AND cm.full_name IS NOT NULL
  AND cm.full_name != '';

-- Step F: Add index for performance
CREATE INDEX IF NOT EXISTS jobs_assigned_team_id_idx 
  ON public.jobs(assigned_team_id);

COMMIT;

-- =============================================================================
-- Verification Queries (run these in Supabase SQL Editor after migration)
-- =============================================================================

/*
-- 1) Count crew_members
SELECT COUNT(*) as crew_member_count
FROM public.crew_members
WHERE company_id IS NOT NULL
  AND full_name IS NOT NULL
  AND full_name != '';

-- 2) Count teams created for those crew_members
SELECT COUNT(*) as team_count
FROM public.teams t
WHERE EXISTS (
  SELECT 1 FROM public.crew_members cm
  WHERE cm.company_id = t.company_id
    AND cm.full_name = t.name
    AND cm.company_id IS NOT NULL
    AND cm.full_name IS NOT NULL
    AND cm.full_name != ''
);

-- 3) Count team_members (should match crew_member_count from #1)
SELECT COUNT(*) as team_member_count
FROM public.team_members;

-- 4) Count jobs with assigned_to (existing)
SELECT COUNT(*) as jobs_with_assigned_to
FROM public.jobs
WHERE assigned_to IS NOT NULL;

-- 5) Count jobs with assigned_team_id (backfilled)
SELECT COUNT(*) as jobs_with_assigned_team_id
FROM public.jobs
WHERE assigned_team_id IS NOT NULL;

-- 6) Count jobs that should have been backfilled but weren't
-- (assigned_to exists but assigned_team_id is NULL)
SELECT COUNT(*) as jobs_missing_team_id
FROM public.jobs j
WHERE j.assigned_to IS NOT NULL
  AND j.assigned_team_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.crew_members cm
    WHERE cm.id = j.assigned_to
      AND cm.company_id IS NOT NULL
      AND cm.full_name IS NOT NULL
      AND cm.full_name != ''
  );

-- 7) Verify foreign key constraint exists
SELECT 
  conname AS constraint_name,
  contype AS constraint_type
FROM pg_constraint
WHERE conrelid = 'public.jobs'::regclass
  AND conname = 'jobs_assigned_team_id_fkey';

-- 8) Verify index exists
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'jobs'
  AND indexname = 'jobs_assigned_team_id_idx';

-- 9) Sample check: Verify a few jobs have both assigned_to and assigned_team_id
SELECT 
  j.id,
  j.assigned_to,
  j.assigned_team_id,
  cm.full_name AS crew_member_name,
  t.name AS team_name
FROM public.jobs j
LEFT JOIN public.crew_members cm ON cm.id = j.assigned_to
LEFT JOIN public.teams t ON t.id = j.assigned_team_id
WHERE j.assigned_to IS NOT NULL
LIMIT 10;

-- 10) Verify teams have exactly one member (team-of-one)
SELECT 
  t.id,
  t.name,
  t.company_id,
  COUNT(tm.id) AS member_count
FROM public.teams t
LEFT JOIN public.team_members tm ON tm.team_id = t.id
GROUP BY t.id, t.name, t.company_id
HAVING COUNT(tm.id) != 1
ORDER BY member_count DESC;

-- Expected: Should return 0 rows (all teams should have exactly 1 member)

-- 11) Summary: All counts should match
SELECT 
  'crew_members' AS entity,
  COUNT(*) AS count
FROM public.crew_members
WHERE company_id IS NOT NULL
  AND full_name IS NOT NULL
  AND full_name != ''
UNION ALL
SELECT 
  'teams (team-of-one)' AS entity,
  COUNT(*) AS count
FROM public.teams t
WHERE EXISTS (
  SELECT 1 FROM public.crew_members cm
  WHERE cm.company_id = t.company_id
    AND cm.full_name = t.name
)
UNION ALL
SELECT 
  'team_members' AS entity,
  COUNT(*) AS count
FROM public.team_members
UNION ALL
SELECT 
  'jobs with assigned_to' AS entity,
  COUNT(*) AS count
FROM public.jobs
WHERE assigned_to IS NOT NULL
UNION ALL
SELECT 
  'jobs with assigned_team_id' AS entity,
  COUNT(*) AS count
FROM public.jobs
WHERE assigned_team_id IS NOT NULL;
*/

