-- =============================================================================
-- Log Product Event RPC (Day 1 - Launch Package)
-- =============================================================================
-- Creates a SECURITY DEFINER RPC for safely inserting product events.
--
-- Function: log_product_event
-- - Derives auth user from auth.uid()
-- - Derives company_id and role from profiles/user context
-- - Does not trust client-supplied company_id
-- - Fails safely if auth context is invalid
-- - Keeps logic minimal and auditable
--
-- Requirements:
-- - SECURITY DEFINER to bypass RLS for insert
-- - Auth-derived tenant context only
-- - Safe error handling
-- =============================================================================

BEGIN;

-- =============================================================================
-- Log Product Event RPC
-- =============================================================================

CREATE OR REPLACE FUNCTION public.log_product_event(
  p_event_name text,
  p_context jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_role text;
  v_event_id uuid;
BEGIN
  -- Require authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    -- Fail silently in production - don't block UX
    -- Log warning in dev via exception (will be caught by frontend)
    RETURN NULL;
  END IF;

  -- Validate event name
  IF p_event_name IS NULL OR trim(p_event_name) = '' THEN
    RETURN NULL;
  END IF;

  -- Derive company_id and role from profiles (never trust client)
  SELECT p.company_id, p.role
  INTO v_company_id, v_role
  FROM public.profiles p
  WHERE p.id = v_user_id;

  -- If no company_id, cannot log event safely
  IF v_company_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Insert event with auth-derived context
  INSERT INTO public.product_events (
    company_id,
    user_id,
    role,
    event_name,
    context
  )
  VALUES (
    v_company_id,
    v_user_id,
    v_role,
    trim(p_event_name),
    COALESCE(p_context, '{}'::jsonb)
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

-- =============================================================================
-- Grant Execute Permission
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.log_product_event(text, jsonb) TO authenticated;

-- Revoke from public/anon for defense in depth
REVOKE ALL ON FUNCTION public.log_product_event(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_product_event(text, jsonb) FROM anon;

COMMIT;
