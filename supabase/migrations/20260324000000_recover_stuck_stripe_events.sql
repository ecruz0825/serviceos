BEGIN;

-- =============================================================================
-- Recover Stuck Stripe Events Function (Phase A.3 Step 3)
-- =============================================================================
-- Creates a function to recover Stripe webhook events stuck in 'processing' state.
--
-- Purpose:
-- - Identify events in 'processing' state that are older than threshold (stuck)
-- - Mark them as 'error' with recovery note
-- - Enable recovery via existing reset_failed_stripe_event + reconcile-billing flow
--
-- Stuck Event Detection:
-- Events are considered stuck if:
-- - processing_state = 'processing'
-- - created_at < now() - interval '5 minutes'
--
-- Threshold Rationale:
-- - Normal webhook processing completes in < 30 seconds
-- - 5 minutes provides conservative buffer for slow processing
-- - Prevents false positives while catching truly stuck events
--
-- Recovery Path:
-- After marking stuck events as error, operators should:
-- 1. Use reset_failed_stripe_event() to reset to 'pending'
-- 2. Use reconcile-billing edge function to correct company billing state
-- This reuses existing Step 2 recovery mechanisms.
--
-- Security:
-- - SECURITY DEFINER with service_role access
-- - Only operates on events in 'processing' state older than threshold
-- =============================================================================

CREATE OR REPLACE FUNCTION public.recover_stuck_stripe_events(
  p_threshold_minutes integer DEFAULT 5,
  p_max_events integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_stuck_count integer;
  v_updated_ids uuid[];
BEGIN
  -- Validate threshold
  IF p_threshold_minutes IS NULL OR p_threshold_minutes < 1 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_THRESHOLD',
      'message', 'threshold_minutes must be at least 1'
    );
  END IF;

  -- Validate max_events
  IF p_max_events IS NULL OR p_max_events < 1 OR p_max_events > 1000 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_MAX_EVENTS',
      'message', 'max_events must be between 1 and 1000'
    );
  END IF;

  -- Find and update stuck events
  WITH stuck_events AS (
    SELECT id
    FROM public.stripe_event_ledger
    WHERE processing_state = 'processing'
      AND created_at < now() - (p_threshold_minutes || ' minutes')::interval
    ORDER BY created_at ASC
    LIMIT p_max_events
    FOR UPDATE SKIP LOCKED
  ),
  updated_events AS (
    UPDATE public.stripe_event_ledger
    SET
      processing_state = 'error',
      processing_error = format('STUCK_PROCESSING_TIMEOUT: Event was in processing state for more than %s minutes. Marked as stuck for recovery.', p_threshold_minutes),
      processed_at = now()
    FROM stuck_events
    WHERE stripe_event_ledger.id = stuck_events.id
    RETURNING stripe_event_ledger.id
  )
  SELECT array_agg(id), count(*)
  INTO v_updated_ids, v_stuck_count
  FROM updated_events;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'STUCK_EVENTS_RECOVERED',
    'message', format('Marked %s stuck event(s) as error for recovery', COALESCE(v_stuck_count, 0)),
    'events_recovered', COALESCE(v_stuck_count, 0),
    'threshold_minutes', p_threshold_minutes,
    'recovered_event_ids', v_updated_ids
  );
END;
$$;

-- =============================================================================
-- Grant permissions
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.recover_stuck_stripe_events(integer, integer) TO service_role;

COMMIT;
