BEGIN;

-- =============================================================================
-- Reset Failed Stripe Event Function (Phase A.3 Step 2)
-- =============================================================================
-- Creates a function to reset failed Stripe webhook events for recovery.
--
-- Purpose:
-- - Reset events in 'error' state to 'pending' state
-- - Increment processing_attempts counter
-- - Clear processing_error message
-- - Enable recovery of failed events
--
-- Recovery Path:
-- After resetting a failed event, operators should use the reconcile-billing
-- edge function to correct the company's billing state based on current
-- Stripe API data. This avoids duplicating webhook processing logic and
-- ensures state consistency with Stripe's source of truth.
--
-- Security:
-- - SECURITY DEFINER with service_role access
-- - Only operates on events in 'error' state
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reset_failed_stripe_event(p_event_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_ledger_id uuid;
  v_current_state text;
  v_attempts integer;
BEGIN
  -- Get current state
  SELECT id, processing_state, processing_attempts
  INTO v_ledger_id, v_current_state, v_attempts
  FROM public.stripe_event_ledger
  WHERE event_id = p_event_id;

  IF v_ledger_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'EVENT_NOT_FOUND',
      'message', 'Event not found in ledger'
    );
  END IF;

  IF v_current_state != 'error' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_STATE',
      'message', format('Event is in %s state, not error', v_current_state),
      'current_state', v_current_state
    );
  END IF;

  -- Reset to pending state
  UPDATE public.stripe_event_ledger
  SET
    processing_state = 'pending',
    processing_attempts = v_attempts + 1,
    processing_error = NULL,
    processed_at = NULL
  WHERE id = v_ledger_id;

  RETURN jsonb_build_object(
    'ok', true,
    'code', 'EVENT_RESET',
    'message', 'Event reset to pending state. Use reconcile-billing edge function to correct company billing state.',
    'ledger_id', v_ledger_id,
    'new_attempts', v_attempts + 1
  );
END;
$$;

-- =============================================================================
-- Grant permissions
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.reset_failed_stripe_event(text) TO service_role;

COMMIT;
