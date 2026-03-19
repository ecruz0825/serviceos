BEGIN;

-- =============================================================================
-- Platform SaaS Metrics Upgrade (Platform Dashboard Enhancement)
-- =============================================================================
-- Upgrades platform metrics to include SaaS-specific metrics:
-- - MRR (Monthly Recurring Revenue) based on active subscriptions
-- - Revenue Processed (renamed from total_revenue for clarity)
-- =============================================================================

-- =============================================================================
-- RPC: get_platform_metrics() - Upgraded
-- =============================================================================
-- Returns aggregated platform-wide metrics including SaaS metrics.
-- Only accessible to platform_admin role.
-- Note: DROP required because RETURNS TABLE signature changed.

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
      SELECT COALESCE(SUM(
        CASE
          WHEN subscription_status = 'active' AND plan = 'starter' THEN 49
          WHEN subscription_status = 'active' AND plan = 'pro' THEN 99
          ELSE 0
        END
      ), 0)::numeric
      FROM public.companies
    ) AS mrr;
END;
$$;

-- Grant execute permissions to authenticated users (platform_admin)
GRANT EXECUTE ON FUNCTION public.get_platform_metrics() TO authenticated;

-- Revoke from public/anon for defense in depth
REVOKE ALL ON FUNCTION public.get_platform_metrics() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_platform_metrics() FROM anon;

COMMIT;
