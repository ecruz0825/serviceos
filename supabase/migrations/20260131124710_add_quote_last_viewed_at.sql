BEGIN;

-- =============================================================================
-- Add quote view tracking (last_viewed_at)
-- Tracks when quotes are viewed via public token
-- =============================================================================

-- 1) Add last_viewed_at column
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS last_viewed_at timestamptz;

-- 2) Create index for admin filtering
CREATE INDEX IF NOT EXISTS quotes_last_viewed_at_idx
  ON public.quotes (last_viewed_at)
  WHERE last_viewed_at IS NOT NULL;

-- 3) Create SECURITY DEFINER RPC: mark_quote_viewed_public
-- Public (no auth required), token-based, prevents spam writes
CREATE OR REPLACE FUNCTION public.mark_quote_viewed_public(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_quote_id uuid;
  v_last_viewed timestamptz;
BEGIN
  -- Find quote by public_token
  SELECT q.id, q.last_viewed_at
  INTO v_quote_id, v_last_viewed
  FROM public.quotes q
  WHERE q.public_token = p_token
  LIMIT 1;

  -- If not found, return error
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'not_found'
    );
  END IF;

  -- Update last_viewed_at only if:
  -- - last_viewed_at is null, OR
  -- - last_viewed_at is older than 15 minutes (prevents spam on refresh)
  IF v_last_viewed IS NULL OR v_last_viewed < now() - interval '15 minutes' THEN
    UPDATE public.quotes
    SET last_viewed_at = now()
    WHERE id = v_quote_id;
  END IF;

  -- Return success
  RETURN jsonb_build_object(
    'ok', true
  );
END;
$$;

-- Grant execute permissions (public, no auth required)
GRANT EXECUTE ON FUNCTION public.mark_quote_viewed_public(uuid) TO anon, authenticated;

COMMIT;

