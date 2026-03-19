BEGIN;

-- =============================================================================
-- Platform Billing Risk & Growth Metrics Upgrade
-- =============================================================================
-- Expands platform metrics to include:
-- - In Grace Period (billing risk indicator)
-- - New Companies (30d) (growth indicator)
-- - Canceled / Inactive (30d) (churn indicator)
-- - Webhook Errors (integration health indicator)
-- =============================================================================

-- =============================================================================
-- RPC: get_platform_metrics() - Expanded
-- =============================================================================
-- Returns aggregated platform-wide metrics including billing risk and growth.
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
  mrr numeric,
  in_grace_period integer,
  new_companies_30d integer,
  canceled_inactive_30d integer,
  webhook_errors integer
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

  -- Return aggregated metrics including SaaS metrics and billing risk/growth
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
    ) AS mrr,
    (
      SELECT COUNT(*)::integer
      FROM public.companies
      WHERE billing_grace_until IS NOT NULL
        AND billing_grace_until > now()
    ) AS in_grace_period,
    (
      SELECT COUNT(*)::integer
      FROM public.companies
      WHERE created_at >= now() - interval '30 days'
    ) AS new_companies_30d,
    (
      SELECT COUNT(*)::integer
      FROM public.companies
      WHERE subscription_status IN ('canceled', 'inactive')
        AND billing_updated_at IS NOT NULL
        AND billing_updated_at >= now() - interval '30 days'
    ) AS canceled_inactive_30d,
    (
      SELECT COUNT(*)::integer
      FROM public.stripe_event_ledger
      WHERE processing_state = 'error'
    ) AS webhook_errors;
END;
$$;

-- Grant execute permissions to authenticated users (platform_admin)
GRANT EXECUTE ON FUNCTION public.get_platform_metrics() TO authenticated;

-- Revoke from public/anon for defense in depth
REVOKE ALL ON FUNCTION public.get_platform_metrics() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_platform_metrics() FROM anon;

COMMIT;
