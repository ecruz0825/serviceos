BEGIN;

-- =============================================================================
-- Rate Limiting for Public RPCs
-- Protects public-facing endpoints from abuse and spam
-- =============================================================================

-- 1) Create rate_limit_events table
CREATE TABLE IF NOT EXISTS public.rate_limit_events (
  id bigserial PRIMARY KEY,
  key text NOT NULL,
  event text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_rate_limit_events_key_event_created 
  ON public.rate_limit_events(key, event, created_at DESC);

-- 3) Enable RLS (optional - for simplicity, we'll allow only service/definer inserts)
ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;

-- 4) RLS Policy: No public SELECT access (rate limit events are internal)
-- Only SECURITY DEFINER functions can insert
DROP POLICY IF EXISTS rate_limit_events_no_select ON public.rate_limit_events;
-- No SELECT policy = no public access

-- 5) Function: check_rate_limit
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key text,
  p_event text,
  p_limit int,
  p_window_seconds int
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_count int;
BEGIN
  -- Count events in the time window
  SELECT COUNT(*)
  INTO v_count
  FROM public.rate_limit_events
  WHERE key = p_key
    AND event = p_event
    AND created_at > now() - (p_window_seconds || ' seconds')::interval;

  -- If limit exceeded, raise exception
  IF v_count >= p_limit THEN
    RAISE EXCEPTION 'rate_limit_exceeded' USING
      MESSAGE = format('Rate limit exceeded: %s events in %s seconds', p_limit, p_window_seconds),
      HINT = 'Please wait before trying again';
  END IF;

  -- Record this event
  INSERT INTO public.rate_limit_events (key, event)
  VALUES (p_key, p_event);

  -- Clean up old events (older than 24 hours) to prevent table bloat
  -- Only clean up occasionally (every ~1000 inserts) to avoid overhead
  IF random() < 0.001 THEN
    DELETE FROM public.rate_limit_events
    WHERE created_at < now() - interval '24 hours';
  END IF;

  RETURN true;
END;
$$;

-- 6) Grant execute to anon and authenticated (public endpoints need it)
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, text, int, int) TO anon, authenticated;

COMMIT;
