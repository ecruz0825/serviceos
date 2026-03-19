BEGIN;

-- =============================================================================
-- Support Mode Foundation (Phase 1A)
-- =============================================================================
-- Creates the database infrastructure for platform_admin tenant impersonation
-- / support mode. This phase is database foundation only - no tenant RLS/RPC
-- changes, no frontend changes, no mutation enablement.
--
-- Design Principles:
-- - Preserve platform_admin identity (current_user_role() unchanged)
-- - Enable company scoping via current_company_id() modification
-- - Support sessions provide audit trail
-- - All access via RPCs (no direct table access)
-- =============================================================================

-- =============================================================================
-- Table: support_sessions
-- =============================================================================
-- Tracks active support sessions where platform_admin temporarily accesses
-- a tenant company's data for support/debugging purposes.

CREATE TABLE IF NOT EXISTS public.support_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_admin_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz NULL,
  reason text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS support_sessions_platform_admin_active_idx
  ON public.support_sessions(platform_admin_id, ended_at)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS support_sessions_target_company_idx
  ON public.support_sessions(target_company_id);

-- RLS: service_role only (no direct authenticated access)
-- This table should be accessed only through RPCs
ALTER TABLE public.support_sessions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS support_sessions_service_role_all ON public.support_sessions;

CREATE POLICY support_sessions_service_role_all
ON public.support_sessions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Explicitly revoke from authenticated/anon/public
GRANT ALL ON public.support_sessions TO service_role;
REVOKE ALL ON public.support_sessions FROM authenticated;
REVOKE ALL ON public.support_sessions FROM anon;
REVOKE ALL ON public.support_sessions FROM public;

-- =============================================================================
-- Helper Function: is_support_mode()
-- =============================================================================
-- Returns true if the current user (auth.uid()) has an active support session.

CREATE OR REPLACE FUNCTION public.is_support_mode()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.support_sessions
    WHERE platform_admin_id = auth.uid()
      AND ended_at IS NULL
  )
$$;

-- =============================================================================
-- Helper Function: current_support_company_id()
-- =============================================================================
-- Returns the target_company_id from the most recent active support session
-- for the current user, or NULL if no active session exists.

CREATE OR REPLACE FUNCTION public.current_support_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT target_company_id
  FROM public.support_sessions
  WHERE platform_admin_id = auth.uid()
    AND ended_at IS NULL
  ORDER BY started_at DESC
  LIMIT 1
$$;

-- =============================================================================
-- Helper Function: current_company_id() - MODIFIED
-- =============================================================================
-- Modified to check for active support session first, then fall back to
-- profile.company_id. This enables company scoping for support mode while
-- preserving normal behavior for tenant users.

CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT COALESCE(
    -- If in support mode, return support company
    public.current_support_company_id(),
    -- Otherwise return profile company_id
    (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  )
$$;

-- =============================================================================
-- RPC: start_support_session
-- =============================================================================
-- Starts a new support session for platform_admin to access a tenant company.
-- Ends any existing active session for the caller first.

CREATE OR REPLACE FUNCTION public.start_support_session(
  p_target_company_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_role text;
  v_session_id uuid;
BEGIN
  -- Verify user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- Get current user role
  v_role := public.current_user_role();

  -- Only platform_admin can start support sessions
  IF v_role <> 'platform_admin' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  -- Verify target company exists
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_target_company_id) THEN
    RAISE EXCEPTION 'COMPANY_NOT_FOUND';
  END IF;

  -- End any existing active support session for this platform_admin
  UPDATE public.support_sessions
  SET ended_at = now()
  WHERE platform_admin_id = auth.uid()
    AND ended_at IS NULL;

  -- Create new active support session
  INSERT INTO public.support_sessions (
    platform_admin_id,
    target_company_id,
    reason
  )
  VALUES (
    auth.uid(),
    p_target_company_id,
    p_reason
  )
  RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$$;

-- =============================================================================
-- RPC: end_support_session
-- =============================================================================
-- Ends the active support session for the current platform_admin.

CREATE OR REPLACE FUNCTION public.end_support_session()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_role text;
  v_updated_count integer;
BEGIN
  -- Verify user is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- Get current user role
  v_role := public.current_user_role();

  -- Only platform_admin can end support sessions
  IF v_role <> 'platform_admin' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  -- End active support session
  UPDATE public.support_sessions
  SET ended_at = now()
  WHERE platform_admin_id = auth.uid()
    AND ended_at IS NULL;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  -- Return true if a session was ended, false if no active session existed
  RETURN v_updated_count > 0;
END;
$$;

-- =============================================================================
-- RPC: get_active_support_session
-- =============================================================================
-- Returns the active support session for the current platform_admin, if any.

CREATE OR REPLACE FUNCTION public.get_active_support_session()
RETURNS TABLE (
  id uuid,
  target_company_id uuid,
  started_at timestamptz,
  reason text
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

  -- Only platform_admin can query support sessions
  IF v_role <> 'platform_admin' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  -- Return active support session
  RETURN QUERY
  SELECT
    ss.id,
    ss.target_company_id,
    ss.started_at,
    ss.reason
  FROM public.support_sessions ss
  WHERE ss.platform_admin_id = auth.uid()
    AND ss.ended_at IS NULL
  ORDER BY ss.started_at DESC
  LIMIT 1;
END;
$$;

-- =============================================================================
-- Grant permissions
-- =============================================================================

-- Grant execute on RPCs to authenticated
GRANT EXECUTE ON FUNCTION public.start_support_session(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_support_session() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_support_session() TO authenticated;

-- Helper functions are SECURITY DEFINER, so they can be called by authenticated
-- (they check auth.uid() internally)
-- No explicit GRANT needed for helper functions, but we can grant for clarity
GRANT EXECUTE ON FUNCTION public.is_support_mode() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_support_company_id() TO authenticated;
-- current_company_id() already has grants from previous migrations

-- Explicitly revoke from public/anon (defense in depth)
REVOKE ALL ON FUNCTION public.start_support_session(uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.start_support_session(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.end_support_session() FROM public;
REVOKE ALL ON FUNCTION public.end_support_session() FROM anon;
REVOKE ALL ON FUNCTION public.get_active_support_session() FROM public;
REVOKE ALL ON FUNCTION public.get_active_support_session() FROM anon;
REVOKE ALL ON FUNCTION public.is_support_mode() FROM public;
REVOKE ALL ON FUNCTION public.is_support_mode() FROM anon;
REVOKE ALL ON FUNCTION public.current_support_company_id() FROM public;
REVOKE ALL ON FUNCTION public.current_support_company_id() FROM anon;

COMMIT;
