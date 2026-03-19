BEGIN;

-- =============================================================================
-- Platform Metrics RPC (Platform Dashboard Expansion)
-- =============================================================================
-- Provides global SaaS metrics for platform_admin users.
-- Read-only, SECURITY DEFINER, platform_admin only.
-- =============================================================================

-- =============================================================================
-- RPC: get_platform_metrics()
-- =============================================================================
-- Returns aggregated platform-wide metrics for ServiceOps SaaS.
-- Only accessible to platform_admin role.

CREATE OR REPLACE FUNCTION public.get_platform_metrics()
RETURNS TABLE (
  total_companies integer,
  active_subscriptions integer,
  trialing_subscriptions integer,
  total_jobs integer,
  total_customers integer,
  total_users integer,
  total_payments integer,
  total_revenue numeric
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

  -- Return aggregated metrics
  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::integer FROM public.companies) AS total_companies,
    (SELECT COUNT(*)::integer FROM public.companies WHERE subscription_status = 'active') AS active_subscriptions,
    (SELECT COUNT(*)::integer FROM public.companies WHERE subscription_status = 'trialing') AS trialing_subscriptions,
    (SELECT COUNT(*)::integer FROM public.jobs) AS total_jobs,
    (SELECT COUNT(*)::integer FROM public.customers) AS total_customers,
    (SELECT COUNT(*)::integer FROM public.profiles WHERE role <> 'customer') AS total_users,
    (SELECT COUNT(*)::integer FROM public.payments) AS total_payments,
    (SELECT COALESCE(SUM(amount), 0)::numeric FROM public.payments) AS total_revenue;
END;
$$;

-- Grant execute permissions to authenticated users (platform_admin)
GRANT EXECUTE ON FUNCTION public.get_platform_metrics() TO authenticated;

-- Revoke from public/anon for defense in depth
REVOKE ALL ON FUNCTION public.get_platform_metrics() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_platform_metrics() FROM anon;

COMMIT;
