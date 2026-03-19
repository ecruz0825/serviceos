-- =============================================================================
-- Plan Usage Helper Function (Phase 3A - Plan Engine Foundation)
-- =============================================================================
-- Creates a read-only function that returns a company's current plan limits
-- and usage snapshot.
--
-- Function: get_company_plan_usage
-- - Returns plan limits from plan_limits table
-- - Returns current usage counts (crew, customers, jobs this month)
-- - Returns exactly one row if company exists, zero rows if not
-- - Respects RLS policies (no SECURITY DEFINER needed)
--
-- Usage:
-- - Called by frontend to display plan usage in billing/admin UI
-- - Called by limit enforcement triggers/functions to check current usage
-- - Provides single-query snapshot of plan status
-- =============================================================================

BEGIN;

-- =============================================================================
-- Plan Usage Helper Function
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_company_plan_usage(p_company_id uuid)
RETURNS TABLE (
  company_id uuid,
  plan_code text,
  max_crew integer,
  max_customers integer,
  max_jobs_per_month integer,
  current_crew bigint,
  current_customers bigint,
  current_jobs_this_month bigint
)
LANGUAGE sql
STABLE
SET search_path TO public
AS $$
  SELECT
    c.id AS company_id,
    c.plan AS plan_code,
    pl.max_crew,
    pl.max_customers,
    pl.max_jobs_per_month,
    (SELECT COUNT(*) FROM public.crew_members WHERE company_id = c.id) AS current_crew,
    (SELECT COUNT(*) FROM public.customers WHERE company_id = c.id) AS current_customers,
    (
      SELECT COUNT(*)
      FROM public.jobs
      WHERE company_id = c.id
        AND created_at >= date_trunc('month', now())
        AND created_at < date_trunc('month', now()) + interval '1 month'
    ) AS current_jobs_this_month
  FROM public.companies c
  LEFT JOIN public.plan_limits pl ON pl.plan_code = c.plan
  WHERE c.id = p_company_id;
$$;

-- =============================================================================
-- Grant Execute Permission
-- =============================================================================
-- Grant to authenticated users so frontend and RPC functions can call it.
-- RLS policies on underlying tables (companies, crew_members, customers, jobs)
-- will naturally restrict access to companies the user has permission to view.

GRANT EXECUTE ON FUNCTION public.get_company_plan_usage(uuid) TO authenticated;

COMMIT;
