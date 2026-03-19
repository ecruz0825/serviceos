-- =============================================================================
-- Plan Limits Table (Phase 3A - Plan Engine Foundation)
-- =============================================================================
-- Creates a table to define SaaS plan limits for ServiceOps.
--
-- Table: public.plan_limits
-- - Defines resource limits per plan tier (starter, pro, etc.)
-- - NULL values indicate unlimited (no restriction)
-- - Non-NULL values must be >= 0 (enforced by CHECK constraint)
--
-- Usage:
-- - Referenced by plan limit enforcement triggers/functions
-- - Read by billing/admin UI to display plan features
-- - Updated when new plans are added or limits change
-- =============================================================================

BEGIN;

-- =============================================================================
-- Create plan_limits table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.plan_limits (
  plan_code text PRIMARY KEY,
  max_crew integer NULL,
  max_customers integer NULL,
  max_jobs_per_month integer NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Add CHECK constraints for non-negative limits
-- =============================================================================
-- When a limit is set (NOT NULL), it must be >= 0.
-- NULL values are allowed and represent unlimited.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'plan_limits_max_crew_check'
      AND conrelid = 'public.plan_limits'::regclass
  ) THEN
    ALTER TABLE public.plan_limits
      ADD CONSTRAINT plan_limits_max_crew_check
      CHECK (max_crew IS NULL OR max_crew >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'plan_limits_max_customers_check'
      AND conrelid = 'public.plan_limits'::regclass
  ) THEN
    ALTER TABLE public.plan_limits
      ADD CONSTRAINT plan_limits_max_customers_check
      CHECK (max_customers IS NULL OR max_customers >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'plan_limits_max_jobs_per_month_check'
      AND conrelid = 'public.plan_limits'::regclass
  ) THEN
    ALTER TABLE public.plan_limits
      ADD CONSTRAINT plan_limits_max_jobs_per_month_check
      CHECK (max_jobs_per_month IS NULL OR max_jobs_per_month >= 0);
  END IF;
END
$$;

-- =============================================================================
-- Seed plan limits data
-- =============================================================================
-- Starter plan: Limited resources (3 crew, 100 customers, 200 jobs/month)
-- Pro plan: Unlimited resources (all NULL = no restrictions)

INSERT INTO public.plan_limits (plan_code, max_crew, max_customers, max_jobs_per_month)
VALUES
  ('starter', 3, 100, 200),
  ('pro', NULL, NULL, NULL)
ON CONFLICT (plan_code) DO UPDATE
SET
  max_crew = EXCLUDED.max_crew,
  max_customers = EXCLUDED.max_customers,
  max_jobs_per_month = EXCLUDED.max_jobs_per_month;

-- =============================================================================
-- Row Level Security (RLS)
-- =============================================================================
-- Enable RLS for the table
ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read plan limits
-- This is safe because plan limits are not sensitive data and need to be
-- readable by the frontend to display plan features and enforce limits.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'plan_limits'
      AND policyname = 'plan_limits_select_authenticated'
  ) THEN
    CREATE POLICY plan_limits_select_authenticated
    ON public.plan_limits
    FOR SELECT
    TO authenticated
    USING (true);
  END IF;
END
$$;

-- Note: No INSERT/UPDATE/DELETE policies - these should be restricted to
-- service_role or admin-only RPC functions for security.

COMMIT;
