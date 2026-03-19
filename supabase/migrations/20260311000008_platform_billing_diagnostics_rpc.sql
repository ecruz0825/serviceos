BEGIN;

-- =============================================================================
-- Platform Billing Diagnostics RPCs (Platform Admin Access)
-- =============================================================================
-- Creates read-only RPC functions for platform_admin to access billing
-- history and Stripe webhook events for diagnostic purposes.
--
-- Security:
-- - SECURITY DEFINER functions with explicit platform_admin role checks
-- - Read-only access (SELECT only, no writes)
-- - Keeps platform admin access separate from tenant RLS policies
-- =============================================================================

-- =============================================================================
-- Function: get_platform_company_billing_history
-- =============================================================================
-- Returns billing subscription history for a specific company.
-- Only accessible to platform_admin role.

CREATE OR REPLACE FUNCTION public.get_platform_company_billing_history(
  p_company_id uuid,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  changed_at timestamptz,
  field_name text,
  old_value text,
  new_value text,
  source text,
  stripe_event_id text
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
  v_limit := GREATEST(COALESCE(p_limit, 50), 1);

  -- Return billing history ordered by changed_at desc
  RETURN QUERY
  SELECT
    bsh.changed_at,
    bsh.field_name,
    bsh.old_value,
    bsh.new_value,
    bsh.source,
    bsh.stripe_event_id
  FROM public.billing_subscription_history bsh
  WHERE bsh.company_id = p_company_id
  ORDER BY bsh.changed_at DESC
  LIMIT v_limit;
END;
$$;

-- =============================================================================
-- Function: get_platform_company_billing_events
-- =============================================================================
-- Returns Stripe webhook events for a specific company.
-- Only accessible to platform_admin role.

CREATE OR REPLACE FUNCTION public.get_platform_company_billing_events(
  p_company_id uuid,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  created_at timestamptz,
  event_type text,
  processing_state text,
  processing_error text
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
  v_limit := GREATEST(COALESCE(p_limit, 50), 1);

  -- Return Stripe events ordered by created_at desc
  RETURN QUERY
  SELECT
    sel.created_at,
    sel.event_type,
    sel.processing_state,
    sel.processing_error
  FROM public.stripe_event_ledger sel
  WHERE sel.company_id = p_company_id
  ORDER BY sel.created_at DESC
  LIMIT v_limit;
END;
$$;

-- =============================================================================
-- Grant permissions
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.get_platform_company_billing_history(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_company_billing_events(uuid, integer) TO authenticated;

-- Explicitly revoke from public/anon (defense in depth)
REVOKE ALL ON FUNCTION public.get_platform_company_billing_history(uuid, integer) FROM public;
REVOKE ALL ON FUNCTION public.get_platform_company_billing_history(uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.get_platform_company_billing_events(uuid, integer) FROM public;
REVOKE ALL ON FUNCTION public.get_platform_company_billing_events(uuid, integer) FROM anon;

COMMIT;
