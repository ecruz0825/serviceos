BEGIN;

-- =============================================================================
-- Company Onboarding Fields
-- Adds fields to track onboarding completion and progress
-- =============================================================================

-- 1) Add onboarding fields to companies table
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS setup_completed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS onboarding_step text NULL;

-- Note: logo_path and primary_color already exist from previous migrations
-- If they don't exist, they would be added here, but checking shows they already exist

-- 2) Create index for onboarding queries (optional, but helpful)
CREATE INDEX IF NOT EXISTS idx_companies_setup_completed 
  ON public.companies(setup_completed_at)
  WHERE setup_completed_at IS NULL;

-- Note: RLS policies for companies table should already allow admin updates
-- Existing RLS patterns should allow company admins to update their company

COMMIT;
