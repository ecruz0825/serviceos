BEGIN;

-- =============================================================================
-- AB10 Phase 4C1-A: Add team-based default assignment to recurring jobs
-- - Add default_team_id column to recurring_jobs (backward compatible)
-- - Backfill from existing default_crew_id using team-of-one mapping
-- - Non-breaking: default_crew_id remains unchanged
-- =============================================================================

-- Step A: Add default_team_id column
ALTER TABLE public.recurring_jobs
  ADD COLUMN IF NOT EXISTS default_team_id uuid NULL;

-- Step B: Add foreign key constraint (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'recurring_jobs_default_team_id_fkey' 
    AND conrelid = 'public.recurring_jobs'::regclass
  ) THEN
    ALTER TABLE public.recurring_jobs
      ADD CONSTRAINT recurring_jobs_default_team_id_fkey
      FOREIGN KEY (default_team_id)
      REFERENCES public.teams(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Step C: Backfill default_team_id from default_crew_id
-- Map via team-of-one: crew_member -> team (company_id + full_name)
UPDATE public.recurring_jobs rj
SET default_team_id = t.id
FROM public.crew_members cm
JOIN public.teams t ON cm.company_id = t.company_id AND cm.full_name = t.name
WHERE rj.default_team_id IS NULL
  AND rj.default_crew_id IS NOT NULL
  AND rj.default_crew_id = cm.id;

-- Step D: Add index for performance
CREATE INDEX IF NOT EXISTS idx_recurring_jobs_default_team_id 
ON public.recurring_jobs(default_team_id);

-- Step E: RLS policies
-- Note: Assuming recurring_jobs uses company-scoped RLS similar to other tables.
-- If recurring_jobs has strict column-based policies that block updates to default_team_id,
-- those would need to be updated here. For now, we assume existing policies allow
-- admins to update all columns, so no RLS changes are needed.

COMMIT;

-- =============================================================================
-- Verification Queries (run these in Supabase SQL editor after migration)
-- =============================================================================

-- Count recurring jobs with default_crew_id set
-- SELECT COUNT(*) as recurring_jobs_with_default_crew_id
-- FROM public.recurring_jobs
-- WHERE default_crew_id IS NOT NULL;

-- Count recurring jobs with default_team_id set (after backfill)
-- SELECT COUNT(*) as recurring_jobs_with_default_team_id
-- FROM public.recurring_jobs
-- WHERE default_team_id IS NOT NULL;

-- Count recurring jobs where default_crew_id exists but default_team_id is null
-- (Should be 0 after backfill if all crew_members have corresponding team-of-one)
-- SELECT COUNT(*) as unmapped_recurring_jobs
-- FROM public.recurring_jobs
-- WHERE default_crew_id IS NOT NULL
--   AND default_team_id IS NULL;

