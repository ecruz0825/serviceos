BEGIN;

-- =============================================================================
-- Job Sessions Schema
-- Adds started_at column and indexes for job session tracking
-- =============================================================================

-- 1) Add started_at column if not present
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS started_at timestamptz;

-- 2) Add index for started_at queries
CREATE INDEX IF NOT EXISTS idx_jobs_company_started_at
  ON public.jobs(company_id, started_at DESC)
  WHERE started_at IS NOT NULL;

-- 3) Add index for completed_at queries (if not exists)
CREATE INDEX IF NOT EXISTS idx_jobs_company_completed_at
  ON public.jobs(company_id, completed_at DESC)
  WHERE completed_at IS NOT NULL;

COMMIT;
