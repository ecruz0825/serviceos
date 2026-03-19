BEGIN;

-- =============================================================================
-- Plan Catalog Table (MRR Calculation Source)
-- =============================================================================
-- Provides a single source of truth for plan pricing used in MRR calculations.
-- Replaces hardcoded pricing in get_platform_metrics().
-- =============================================================================

-- =============================================================================
-- Table: plan_catalog
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.plan_catalog (
  plan_code text PRIMARY KEY,
  monthly_price numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add constraint to ensure monthly_price is non-negative
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'plan_catalog_monthly_price_check'
      AND conrelid = 'public.plan_catalog'::regclass
  ) THEN
    ALTER TABLE public.plan_catalog
      ADD CONSTRAINT plan_catalog_monthly_price_check
      CHECK (monthly_price >= 0);
  END IF;
END
$$;

-- Seed plan catalog with current pricing
INSERT INTO public.plan_catalog (plan_code, monthly_price)
VALUES
  ('starter', 39.99),
  ('pro', 59.99)
ON CONFLICT (plan_code) DO UPDATE
SET monthly_price = EXCLUDED.monthly_price;

-- =============================================================================
-- Update: get_platform_metrics() - Use plan_catalog for MRR
-- =============================================================================
-- Replaces hardcoded pricing with plan_catalog lookup.

DROP FUNCTION IF EXISTS public.get_platform_metrics();

CREATE FUNCTION public.get_platform_metrics()
RETURNS TABLE (
  total_companies integer,
  active_subscriptions integer,
  trialing_subscriptions integer,
  total_jobs integer,
  total_customers integer,
  total_users integer,
  total_payments integer,
  revenue_processed numeric,
  mrr numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_role text;
BEGIN
  -- Require authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- Verify caller is platform_admin
  v_role := public.current_user_role();
  IF v_role <> 'platform_admin' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  -- Return aggregated metrics including SaaS metrics
  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::integer FROM public.companies) AS total_companies,
    (SELECT COUNT(*)::integer FROM public.companies WHERE subscription_status = 'active') AS active_subscriptions,
    (SELECT COUNT(*)::integer FROM public.companies WHERE subscription_status = 'trialing') AS trialing_subscriptions,
    (SELECT COUNT(*)::integer FROM public.jobs) AS total_jobs,
    (SELECT COUNT(*)::integer FROM public.customers) AS total_customers,
    (SELECT COUNT(*)::integer FROM public.profiles WHERE role <> 'customer') AS total_users,
    (SELECT COUNT(*)::integer FROM public.payments) AS total_payments,
    (SELECT COALESCE(SUM(amount), 0)::numeric FROM public.payments) AS revenue_processed,
    (
      SELECT COALESCE(SUM(pc.monthly_price), 0)::numeric
      FROM public.companies c
      JOIN public.plan_catalog pc ON pc.plan_code = c.plan
      WHERE c.subscription_status = 'active'
    ) AS mrr;
END;
$$;

-- Grant execute permissions to authenticated users (platform_admin)
GRANT EXECUTE ON FUNCTION public.get_platform_metrics() TO authenticated;

-- Revoke from public/anon for defense in depth
REVOKE ALL ON FUNCTION public.get_platform_metrics() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_platform_metrics() FROM anon;

COMMIT;
