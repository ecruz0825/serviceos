BEGIN;

-- =============================================================================
-- Platform Companies RPC (Platform Admin Access)
-- =============================================================================
-- Creates a read-only RPC function for platform_admin to list companies
-- with pagination support for the Platform Companies Manager page.
--
-- Security:
-- - SECURITY DEFINER function with explicit platform_admin role check
-- - Read-only access (SELECT only, no writes)
-- - Keeps platform admin access separate from tenant RLS policies
-- =============================================================================

-- =============================================================================
-- Function: get_platform_companies
-- =============================================================================
-- Returns a paginated list of companies ordered by creation date.
-- Only accessible to platform_admin role.

CREATE OR REPLACE FUNCTION public.get_platform_companies(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
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
  v_offset integer;
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

  -- Ensure limit is at least 1 and offset is at least 0
  v_limit := GREATEST(COALESCE(p_limit, 50), 1);
  v_offset := GREATEST(COALESCE(p_offset, 0), 0);

  -- Return paginated companies ordered by created_at desc
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
  ORDER BY c.created_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

-- =============================================================================
-- Grant permissions
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.get_platform_companies(integer, integer) TO authenticated;

-- Explicitly revoke from public/anon (defense in depth)
REVOKE ALL ON FUNCTION public.get_platform_companies(integer, integer) FROM public;
REVOKE ALL ON FUNCTION public.get_platform_companies(integer, integer) FROM anon;

COMMIT;
