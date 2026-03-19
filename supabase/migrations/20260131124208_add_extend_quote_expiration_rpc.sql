BEGIN;

-- =============================================================================
-- Add extend_quote_expiration() RPC for admin quote expiration management
-- Multi-tenant safe: verifies caller belongs to same company as quote
-- =============================================================================

CREATE OR REPLACE FUNCTION public.extend_quote_expiration(
  p_quote_id uuid,
  p_days int DEFAULT 14
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_role text;
  v_company_id uuid;
  v_quote record;
  v_new_expires_at timestamptz;
BEGIN
  -- Verify caller is authenticated
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'not_found_or_forbidden'
    );
  END IF;

  -- Get caller's role and company_id
  SELECT p.role, p.company_id INTO v_role, v_company_id
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'not_found_or_forbidden'
    );
  END IF;

  -- Only admin can extend expiration
  IF v_role <> 'admin' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'not_found_or_forbidden'
    );
  END IF;

  -- Look up quote and verify it belongs to caller's company
  SELECT q.*
  INTO v_quote
  FROM public.quotes q
  WHERE q.id = p_quote_id
    AND q.company_id = v_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'not_found_or_forbidden'
    );
  END IF;

  -- Calculate new expiration date
  -- If expires_at is null, set to now() + p_days
  -- Else set to GREATEST(expires_at, now()) + p_days
  IF v_quote.expires_at IS NULL THEN
    v_new_expires_at := now() + (p_days || ' days')::interval;
  ELSE
    v_new_expires_at := GREATEST(v_quote.expires_at, now()) + (p_days || ' days')::interval;
  END IF;

  -- Update quote expiration
  UPDATE public.quotes
  SET expires_at = v_new_expires_at
  WHERE id = p_quote_id;

  -- Return success with new expiration date
  RETURN jsonb_build_object(
    'ok', true,
    'expires_at', v_new_expires_at
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.extend_quote_expiration(uuid, int) TO authenticated;

COMMIT;

