BEGIN;

-- =============================================================================
-- Platform Dashboard RPCs (Platform Admin Access)
-- =============================================================================
-- Creates read-only RPC functions for platform_admin to access cross-tenant
-- company and subscription data for the Platform Dashboard.
--
-- Security:
-- - SECURITY DEFINER functions with explicit platform_admin role checks
-- - Read-only access (SELECT only, no writes)
-- - Keeps platform admin access separate from tenant RLS policies
-- =============================================================================

-- =============================================================================
-- Function: get_platform_companies_summary
-- =============================================================================
-- Returns aggregated subscription statistics across all companies.
-- Only accessible to platform_admin role.

CREATE OR REPLACE FUNCTION public.get_platform_companies_summary()
RETURNS TABLE (
  total_companies bigint,
  active_subscriptions bigint,
  trialing_subscriptions bigint,
  past_due_unpaid bigint,
  inactive_canceled bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_role text;
BEGIN
  -- Verify user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- Get current user role
  v_role := public.current_user_role();

  -- Only platform_admin can access this function
  IF v_role <> 'platform_admin' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  -- Return aggregated counts from companies table
  RETURN QUERY
  SELECT
    COUNT(*)::bigint AS total_companies,
    COUNT(*) FILTER (WHERE subscription_status = 'active')::bigint AS active_subscriptions,
    COUNT(*) FILTER (WHERE subscription_status = 'trialing')::bigint AS trialing_subscriptions,
    COUNT(*) FILTER (WHERE subscription_status IN ('past_due', 'unpaid'))::bigint AS past_due_unpaid,
    COUNT(*) FILTER (WHERE subscription_status IN ('inactive', 'canceled'))::bigint AS inactive_canceled
  FROM public.companies;
END;
$$;

-- =============================================================================
-- Function: get_platform_recent_companies
-- =============================================================================
-- Returns a list of recent companies with billing information.
-- Only accessible to platform_admin role.

CREATE OR REPLACE FUNCTION public.get_platform_recent_companies(p_limit integer DEFAULT 20)
RETURNS TABLE (
  id uuid,
  name text,
  plan text,
  subscription_status text,
  trial_ends_at timestamptz,
  billing_updated_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_role text;
  v_limit integer;
BEGIN
  -- Verify user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- Get current user role
  v_role := public.current_user_role();

  -- Only platform_admin can access this function
  IF v_role <> 'platform_admin' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  -- Ensure limit is at least 1
  v_limit := GREATEST(COALESCE(p_limit, 20), 1);

  -- Return recent companies ordered by billing_updated_at, then created_at
  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.plan,
    c.subscription_status,
    c.trial_ends_at,
    c.billing_updated_at,
    c.created_at
  FROM public.companies c
  ORDER BY
    c.billing_updated_at DESC NULLS LAST,
    c.created_at DESC
  LIMIT v_limit;
END;
$$;

-- =============================================================================
-- Grant permissions
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.get_platform_companies_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_recent_companies(integer) TO authenticated;

-- Explicitly revoke from public/anon (defense in depth)
REVOKE ALL ON FUNCTION public.get_platform_companies_summary() FROM public;
REVOKE ALL ON FUNCTION public.get_platform_companies_summary() FROM anon;
REVOKE ALL ON FUNCTION public.get_platform_recent_companies(integer) FROM public;
REVOKE ALL ON FUNCTION public.get_platform_recent_companies(integer) FROM anon;

COMMIT;
