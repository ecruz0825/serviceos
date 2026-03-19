BEGIN;

-- =============================================================================
-- Platform Company Detail RPC (Platform Admin Access)
-- =============================================================================
-- Creates a read-only RPC function for platform_admin to fetch detailed
-- company information including billing and Stripe data.
--
-- Security:
-- - SECURITY DEFINER function with explicit platform_admin role check
-- - Read-only access (SELECT only, no writes)
-- - Keeps platform admin access separate from tenant RLS policies
-- =============================================================================

-- =============================================================================
-- Function: get_platform_company
-- =============================================================================
-- Returns detailed information for a specific company.
-- Only accessible to platform_admin role.

CREATE OR REPLACE FUNCTION public.get_platform_company(p_company_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  plan text,
  subscription_status text,
  trial_ends_at timestamptz,
  billing_grace_until timestamptz,
  billing_updated_at timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz
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

  -- Return company details
  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.plan,
    c.subscription_status,
    c.trial_ends_at,
    c.billing_grace_until,
    c.billing_updated_at,
    c.stripe_customer_id,
    c.stripe_subscription_id,
    c.created_at
  FROM public.companies c
  WHERE c.id = p_company_id;
END;
$$;

-- =============================================================================
-- Grant permissions
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.get_platform_company(uuid) TO authenticated;

-- Explicitly revoke from public/anon (defense in depth)
REVOKE ALL ON FUNCTION public.get_platform_company(uuid) FROM public;
REVOKE ALL ON FUNCTION public.get_platform_company(uuid) FROM anon;

COMMIT;
